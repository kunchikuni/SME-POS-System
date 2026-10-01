/**
 * Billing reminders — the emails and texts that stand in for an automatic charge.
 *
 * Paynow cannot charge anyone again on its own (see lib/paynow.ts), so every
 * renewal is the owner choosing to pay. Left alone, owners forget; so as a
 * trial or paid period runs out the owner is told, at most five times for each
 * period:
 *
 *   soon      5 days before it ends (2 for a trial — it is only 7 days long)
 *   tomorrow  with a day to go
 *   ended     the day it ends: the dashboard is locked, tills still sell
 *   pausing   two days before the tills' grace period is over
 *   paused    when it is over and sync pauses
 *
 * Every stage goes by email; by text (to an owner who has given a mobile
 * number) all but the first — a text costs money, and `soon` is the stage most
 * people act on from the email anyway.
 *
 * A job that missed a stage (server down) skips it rather than sending a stale
 * "5 days left" — only the stage that applies NOW is ever sent. A business is
 * not written to again after `paused`: an abandoned account is left alone.
 *
 * Each reminder, on each channel, is claimed in the database BEFORE it is sent
 * (the unique key on BillingReminder), so a restart, or two instances of the
 * server, never send the same one twice; if the send then fails the claim is
 * released and the next run tries again. The channels are independent: a text
 * that fails does not hold back the email, and the email is not re-sent
 * because the text failed.
 *
 * Off unless BILLING_REMINDERS=on and at least one of email (RESEND_API_KEY) and
 * SMS (SMS_PROVIDER + its keys) is set up, so a development database full of
 * test businesses never contacts anyone.
 */
import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import { runWithTenant, withoutTenantScope } from '../../lib/tenantScope.js';
import { emailConfigured, sendEmail } from '../../lib/email.js';
import { smsConfigured, sendSms } from '../../lib/sms.js';
import {
  MAINTENANCE_GRACE_DAYS, accessSummary, type AccessSummary, type TenantForEntitlement,
} from './entitlementService.js';
import { reminderEmail, reminderSms, type ReminderStage } from './reminderEmail.js';

export type { ReminderStage };
export type ReminderChannel = 'email' | 'sms';

const DAY = 86_400_000;
/** How long before the end the first reminder goes out. */
export const SOON_DAYS = 5;
export const TRIAL_SOON_DAYS = 2;
/** How long before the tills pause the "pausing" reminder goes out. */
export const PAUSING_DAYS = 2;
/** After the tills pause, how long the "paused" reminder is still worth sending. */
export const PAUSED_WINDOW_DAYS = 2;

/** The stages that are also texted. */
export const SMS_STAGES: ReadonlySet<ReminderStage> = new Set<ReminderStage>(['tomorrow', 'ended', 'pausing', 'paused']);

/**
 * Which reminder, if any, a business is due right now. Pure: the same
 * AccessSummary the dashboard shows is the only input.
 */
export function reminderStage(s: AccessSummary, now: Date = new Date()): ReminderStage | null {
  if (!s.endsAt) return null; // no end date on record — nothing is running out

  if (s.blocked) {
    if (s.state === 'grace') {
      // Dashboard locked, tills still selling: say so at first, and warn again just before they stop.
      return s.graceEndsAt && s.graceEndsAt.getTime() - now.getTime() <= PAUSING_DAYS * DAY ? 'pausing' : 'ended';
    }
    // The tills have paused. Say so once, for a couple of days, then leave them be.
    if (s.graceEndsAt && now.getTime() - s.graceEndsAt.getTime() <= PAUSED_WINDOW_DAYS * DAY) return 'paused';
    return null;
  }

  const left = s.endsAt.getTime() - now.getTime();
  if (left <= DAY) return 'tomorrow';
  if (left <= (s.kind === 'trial' ? TRIAL_SOON_DAYS : SOON_DAYS) * DAY) return 'soon';
  return null;
}

/** Where the owner pays: this business's own Payments page. */
export function paymentsUrl(subdomain: string): string {
  const scheme = process.env.APP_SCHEME ?? 'https';
  const root = process.env.TENANT_DOMAIN ?? 'localhost';
  return `${scheme}://${subdomain}.${root}/settings/payments`;
}

export interface ReminderDeps {
  now?: Date;
  /** Sends one email; throws if it could not be sent. */
  send?: (to: string, subject: string, html: string) => Promise<void>;
  /** Sends one text; throws if it could not be sent. */
  sendText?: (to: string, body: string) => Promise<void>;
  /** Whether email / SMS are set up. A channel that is not is skipped (rather than claimed and never delivered). */
  emailConfigured?: () => boolean;
  smsConfigured?: () => boolean;
}

export interface ReminderRun {
  /** Neither email nor SMS is set up, so nothing was looked at. */
  skipped?: 'no email or SMS provider configured';
  /** Businesses whose dates fell in the window and were looked at. */
  checked: number;
  sent: { tenantId: string; stage: ReminderStage; channel: ReminderChannel }[];
  /** Reminders that were due but could not be sent (they will be retried on the next run). */
  failed: number;
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';

/** Everyone whose trial or paid period ends (or ended) close enough to matter. */
async function candidateTenantIds(now: Date): Promise<string[]> {
  const from = new Date(now.getTime() - (MAINTENANCE_GRACE_DAYS + PAUSED_WINDOW_DAYS + 1) * DAY);
  const to = new Date(now.getTime() + (SOON_DAYS + 1) * DAY);

  const trials = await db.tenant.findMany({
    where: { plan: 'trial', status: { not: 'suspended' }, deletedAt: null, trialEndsAt: { gte: from, lte: to } },
    select: { id: true },
  });
  const paid = await withoutTenantScope(() =>
    db.subscription.findMany({
      where: { status: 'active', currentPeriodEnd: { gte: from, lte: to } },
      select: { tenantId: true },
    }),
  );
  return [...new Set([...trials.map((t: { id: string }) => t.id), ...paid.map((p: { tenantId: string }) => p.tenantId)])];
}

type Owner = { email: string; name: string; phone: string | null };

/** Looks at every business whose dates are close, and sends each the reminder it is due. */
export async function runBillingReminders(deps: ReminderDeps = {}): Promise<ReminderRun> {
  const now = deps.now ?? new Date();
  const email = (deps.emailConfigured ?? emailConfigured)();
  const sms = (deps.smsConfigured ?? smsConfigured)();
  if (!email && !sms) return { skipped: 'no email or SMS provider configured', checked: 0, sent: [], failed: 0 };

  const sendMail = deps.send ?? ((to, subject, html) => sendEmail({ to, subject, html }));
  const sendText = deps.sendText ?? ((to, body) => sendSms({ to, body }));

  const ids = await candidateTenantIds(now);
  const run: ReminderRun = { checked: ids.length, sent: [], failed: 0 };

  for (const id of ids) {
    try {
      const tenant = await db.tenant.findFirst({
        where: { id, status: { not: 'suspended' }, deletedAt: null },
        include: {
          // Same pick as the dashboard's gate (middleware/resolveTenant.ts): the newest paid subscription.
          subscriptions: {
            where: { status: 'active' }, orderBy: { createdAt: 'desc' }, take: 1,
            select: { status: true, zimraAddon: true, currentPeriodEnd: true },
          },
        },
      });
      if (!tenant) continue;

      const forEntitlement: TenantForEntitlement = {
        plan: tenant.plan, trialEndsAt: tenant.trialEndsAt, subscription: tenant.subscriptions[0] ?? null,
      };
      // Re-derived from the latest subscription, not the one that put the
      // business in the window: someone who has renewed is no longer due anything.
      const summary = accessSummary(forEntitlement, now);
      const stage = reminderStage(summary, now);
      if (!stage || !summary.endsAt) continue;
      const endsAt = summary.endsAt;

      const sentOn = await runWithTenant(id, async () => {
        const owners: Owner[] = await db.user.findMany({
          where: { role: 'owner', deletedAt: null }, select: { email: true, name: true, phone: true },
        });
        const payUrl = paymentsUrl(tenant.subdomain);
        const content = (o: Owner) => ({
          stage, kind: summary.kind, businessName: tenant.name, ownerName: o.name,
          endsAt, graceEndsAt: summary.graceEndsAt, payUrl,
        });

        /** Claim it, send it to each recipient, release the claim if that fails. True if it went out. */
        const deliver = async (channel: ReminderChannel, recipients: Owner[], send: (o: Owner) => Promise<void>) => {
          if (recipients.length === 0) return false;

          // Already sent? Checked first so an hourly job does not trip (and log) a
          // database error for every business in its stage on every run.
          const already = await db.billingReminder.findFirst({ where: { periodEnd: endsAt, stage, channel }, select: { id: true } });
          if (already) return false;

          // Claim it, then send. A unique-key clash here means another server got
          // there in the meantime — the same answer, reached by a race.
          try {
            await db.billingReminder.create({ data: { id: crypto.randomUUID(), tenantId: id, periodEnd: endsAt, stage, channel } });
          } catch (e) {
            if (isUniqueViolation(e)) return false;
            throw e;
          }
          try {
            for (const o of recipients) await send(o);
          } catch (e) {
            await db.billingReminder.deleteMany({ where: { periodEnd: endsAt, stage, channel } }); // so the next run retries
            throw e;
          }
          return true;
        };

        const went: ReminderChannel[] = [];
        // The channels are independent: one failing must not stop the other.
        const attempt = async (channel: ReminderChannel, go: () => Promise<boolean>) => {
          try {
            if (await go()) went.push(channel);
          } catch (e) {
            run.failed++;
            console.error(`Billing ${channel} reminder failed for tenant`, id, e instanceof Error ? e.message : e);
          }
        };

        if (email) {
          await attempt('email', () => deliver('email', owners.filter((o) => o.email), async (o) => {
            const { subject, html } = reminderEmail(content(o));
            await sendMail(o.email, subject, html);
          }));
        }
        if (sms && SMS_STAGES.has(stage)) {
          await attempt('sms', () => deliver('sms', owners.filter((o) => o.phone), async (o) => {
            await sendText(o.phone!, reminderSms(content(o)));
          }));
        }
        return went;
      });
      for (const channel of sentOn) run.sent.push({ tenantId: id, stage, channel });
    } catch (e) {
      run.failed++;
      console.error('Billing reminder failed for tenant', id, e instanceof Error ? e.message : e);
    }
  }
  return run;
}

/**
 * Starts the hourly job. Returns a function that stops it, or null when
 * reminders are off. Timers are unref'd so they never keep the process alive.
 */
export function startBillingReminders(opts: { intervalMs?: number; firstDelayMs?: number } = {}): (() => void) | null {
  if (process.env.BILLING_REMINDERS !== 'on') {
    console.log('Billing reminders: off (set BILLING_REMINDERS=on to remind owners as their plan runs out)');
    return null;
  }
  const channels = [emailConfigured() && 'email', smsConfigured() && 'SMS'].filter(Boolean);
  if (channels.length === 0) {
    console.warn('Billing reminders: BILLING_REMINDERS=on but neither RESEND_API_KEY nor an SMS provider is set — no reminders will be sent');
    return null;
  }

  let running = false;
  const tick = async () => {
    if (running) return; // a slow run is never overlapped by the next
    running = true;
    try {
      const r = await runBillingReminders();
      if (r.sent.length || r.failed) {
        console.log(`Billing reminders: ${r.sent.length} sent, ${r.failed} failed (${r.checked} businesses checked)`);
      }
    } catch (e) {
      console.error('Billing reminders run failed:', e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };

  const first = setTimeout(tick, opts.firstDelayMs ?? 60_000);
  const every = setInterval(tick, opts.intervalMs ?? 60 * 60_000);
  first.unref();
  every.unref();
  console.log(`Billing reminders: on (${channels.join(' + ')})`);
  return () => { clearTimeout(first); clearInterval(every); };
}
