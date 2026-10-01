/**
 * Billing routes — port of BillingController, with the real Paynow
 * integration built out (was a 501 stub; see lib/paynow.ts for the client
 * itself and why it's a one-time-payment flow, not native recurring
 * billing -- Paynow's API doesn't have a "charge again next month"
 * primitive).
 *
 * What gets paid, and when (prices in domain/billing/pricing.ts, the rules in
 * domain/billing/maintenance.ts):
 *   - BYOD            $19.99 for each month, paid by hand each month.
 *   - Standard/Premium bought once -- hardware and the FIRST month included --
 *                     then a $5 maintenance fee for every month after that.
 * Every payment buys 30-day periods (currentPeriodEnd) -- one, or up to a year
 * ahead for BYOD and maintenance. When they run out the dashboard locks and,
 * after a short grace, the tills pause (see ensureSubscribed /
 * ensureDeviceSubscribed). Nothing is charged automatically; the reminder
 * emails (domain/billing/reminders.ts) are what nudge the owner to pay.
 *
 * Split into two exports, mounted at two different trust levels in
 * index.ts -- this matters, not just style:
 *   billingRoutes       -> mounted under `dashboard` (requireAuth applied).
 *                           GET /payments, POST /payments/subscribe and
 *                           POST /payments/maintenance.
 *   billingWebhookRoutes -> mounted directly on `tenant` (no auth) so
 *                           Paynow's server-to-server callback can reach
 *                           it without a session cookie it could never
 *                           present. Previously both lived in one router
 *                           mounted at the unauthenticated level, which
 *                           meant GET /payments had never actually
 *                           required a login at all (a minor pre-existing
 *                           info-disclosure gap, fixed here as a side
 *                           effect of building the real subscribe flow --
 *                           ctx.get('user') needed real auth applied
 *                           upstream to be safe to call).
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { initiateTransaction, verifyHash, isPaidStatus, PaynowNotConfiguredError } from '../lib/paynow.js';
import { accessSummary } from '../domain/billing/entitlementService.js';
import {
  MAINTENANCE_FEE_CENTS, PREPAY_OPTIONS, billedMonths, freeMonths, monthsFromReference, nextPeriodEnd, paysMaintenance,
} from '../domain/billing/maintenance.js';
import { PLAN_PRICES, usd } from '../domain/billing/pricing.js';
import type { HonoVars } from '../lib/context.js';

export const billingRoutes = new Hono<{ Variables: HonoVars }>();
export const billingWebhookRoutes = new Hono<{ Variables: HonoVars }>();

const ADMIN_ROLES = new Set(['owner', 'manager']);

/** How many months to pay for: one unless the request says otherwise, and only the numbers the page offers. */
const monthsSchema = z
  .number()
  .int()
  .refine((n) => (PREPAY_OPTIONS as readonly number[]).includes(n), 'Choose 1, 3, 6 or 12 months.')
  .default(1);

/**
 * What the dashboard's Payments page shows — sent with GET /payments so the
 * page can't drift from what's actually charged. (It used to hardcode its
 * own "Growth"/"Scale" plans the server didn't recognise, so choosing one
 * failed at payment.) Feature wording mirrors the marketing page; branch
 * limits mirror entitlementService.ts.
 */
const PLAN_DISPLAY: Record<string, { label: string; branches: number | null; features: string[] }> = {
  byod: {
    label: 'BYOD', branches: 1,
    features: ['1 till', '5 staff accounts', 'Inventory', 'Basic reports', 'Offline first', 'Cloud synchronization', 'Support'],
  },
  standard: {
    label: 'Standard', branches: 3,
    features: ['Everything in BYOD', '10" Android tablet + Bluetooth thermal printer included', 'Implementation training included', 'AI Insights', 'Task management'],
  },
  premium: {
    label: 'Premium', branches: null,
    features: ['Everything in Standard', '12" Android tablet (upgraded)', 'Payroll & HR', 'ZIMRA Fiscalisation included', 'Priority support'],
  },
};

/** The plan the business has actually paid for: its latest paid (active) subscription of that plan. */
const paidSubscription = (plan: string) =>
  db.subscription.findFirst({ where: { plan, status: 'active' }, orderBy: { createdAt: 'desc' } });

billingRoutes.get('/payments', async (ctx) => {
  const t = ctx.get('tenant');
  // Latest PAID subscription -- not just the latest row, which is often a
  // pending (unpaid) one and would show up here as the "current plan".
  const subscription = await db.subscription.findFirst({
    where: { tenantId: t.id, status: 'active' },
    orderBy: { createdAt: 'desc' },
  });
  const plans = Object.entries(PLAN_PRICES).map(([key, p]) => ({
    key,
    label: PLAN_DISPLAY[key]?.label ?? p.label,
    amountCents: p.amountCents,
    recurring: p.recurring,
    maintenanceCents: paysMaintenance(key) ? MAINTENANCE_FEE_CENTS : null,
    branches: PLAN_DISPLAY[key]?.branches ?? null,
    features: PLAN_DISPLAY[key]?.features ?? [],
  }));

  // Maintenance is due on a Standard/Premium plan that has an end date. One
  // bought before maintenance existed has none (null = never expires) and is
  // grandfathered -- nothing is owed on it.
  const maintenance =
    paysMaintenance(t.plan) && subscription?.plan === t.plan && subscription.currentPeriodEnd
      ? { amountCents: MAINTENANCE_FEE_CENTS, plan: t.plan, paidThrough: subscription.currentPeriodEnd }
      : null;

  return ctx.json({
    subscription,
    plan: t.plan,
    trialEndsAt: t.trialEndsAt,
    plans,
    maintenance,
    /** The ways to pay ahead (BYOD and maintenance): months covered, and months actually charged. */
    prepay: PREPAY_OPTIONS.map((months) => ({ months, billedMonths: billedMonths(months) })),
    access: accessSummary(t as any),
  });
});

/**
 * Starts one Paynow payment and records it as pending; the webhook activates
 * it. Shared by buying a plan and paying maintenance -- `prefix` is how the
 * webhook tells them apart (sub_ = a plan, maint_ = a maintenance month).
 */
async function startPayment(
  ctx: Context<{ Variables: HonoVars }>,
  input: { plan: string; amountCents: number; label: string; prefix: 'sub' | 'maint'; months?: number; zimraAddon?: boolean },
) {
  const tenant = ctx.get('tenant');
  const user = ctx.get('user');
  // `amountCents` is ONE month's price. Paying ahead is charged for fewer
  // months than it covers (pay for 12, get 2 free -- see billedMonths). The
  // months COVERED ride in the reference (`..._m12`) so the webhook knows how
  // long a period the payment bought.
  const months = input.months ?? 1;
  const free = freeMonths(months);

  // The request's own Host header (not a static env var) is what correctly
  // varies per tenant subdomain -- same reasoning as auth.ts/resolveDevice.ts
  // elsewhere in this app. APP_SCHEME defaults to https for production;
  // override to http only for local dev against a plain http:// tunnel.
  const origin = `${process.env.APP_SCHEME ?? 'https'}://${ctx.req.header('host')}`;
  const reference = `${input.prefix}_${tenant.id}_${Date.now()}_m${months}`;

  let init;
  try {
    init = await initiateTransaction({
      reference,
      amount: (input.amountCents * billedMonths(months)) / 100,
      additionalInfo: `Wivae ${input.label}${months > 1 ? ` x ${months} months${free ? ` (${free} free)` : ''}` : ''} - ${tenant.name}`,
      authEmail: user.email,
      returnUrl: `${origin}/settings/payments?paynow=return`,
      resultUrl: `${origin}/api/billing/webhook`,
    });
  } catch (err) {
    if (err instanceof PaynowNotConfiguredError) {
      return ctx.json({ message: 'Payments are not configured yet. Contact support.' }, 503);
    }
    console.error('Paynow initiate failed:', err instanceof Error ? err.message : err);
    return ctx.json({ message: 'Could not start payment with Paynow. Please try again shortly.' }, 502);
  }

  // A pending record the webhook will find and flip to active on payment
  // confirmation. "trialing" doubles as "not yet paid" -- there's no
  // separate pending status in this app's vocabulary; see class docblock.
  await db.subscription.create({
    data: {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      plan: input.plan,
      status: 'trialing',
      zimraAddon: input.zimraAddon ?? false,
      providerRef: reference,
      pollUrl: init.pollUrl,
    },
  });

  return ctx.json({ redirectUrl: init.browserUrl });
}

// POST /billing/payments/subscribe -- starts one Paynow payment for the
// chosen plan and returns the URL to send the customer's browser to.
billingRoutes.post('/payments/subscribe', async (ctx) => {
  const user = ctx.get('user');
  if (!ADMIN_ROLES.has(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const { plan, months: asked } = z
    .object({ plan: z.enum(['byod', 'standard', 'premium']), months: monthsSchema })
    .parse(await ctx.req.json());
  const price = PLAN_PRICES[plan];
  // Only a monthly plan can be paid ahead. Standard/Premium are bought once,
  // with their first month included, whatever the request says.
  const months = price.recurring ? asked : 1;

  // Standard and Premium are bought once. A business that already has the plan
  // -- including one whose month has run out -- must not pay the full price a
  // second time; the $5 maintenance is what brings it back.
  if (paysMaintenance(plan) && (await paidSubscription(plan))) {
    return ctx.json(
      {
        message: `${PLAN_DISPLAY[plan].label} is already paid for. Pay the ${usd(MAINTENANCE_FEE_CENTS)} monthly maintenance to keep it running.`,
        code: 'already_purchased',
      },
      409,
    );
  }

  return startPayment(ctx, { plan, amountCents: price.amountCents, label: price.label, prefix: 'sub', months });
});

// POST /billing/payments/maintenance -- one month of upkeep for a Standard or
// Premium plan. Allowed at any time: paying early adds a month on top of the
// one already paid for (see nextPeriodEnd).
billingRoutes.post('/payments/maintenance', async (ctx) => {
  const user = ctx.get('user');
  if (!ADMIN_ROLES.has(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const { months } = z.object({ months: monthsSchema }).parse(await ctx.req.json().catch(() => ({})));
  const tenant = ctx.get('tenant');
  if (!paysMaintenance(tenant.plan)) {
    return ctx.json(
      { message: 'Monthly maintenance only applies to the Standard and Premium plans.', code: 'not_applicable' },
      400,
    );
  }

  const owned = await paidSubscription(tenant.plan);
  if (!owned) {
    return ctx.json(
      { message: `We have no payment on record for ${PLAN_DISPLAY[tenant.plan]?.label ?? tenant.plan}. Choose a plan to buy it first.`, code: 'no_purchase' },
      409,
    );
  }
  if (!owned.currentPeriodEnd) {
    return ctx.json(
      { message: 'This plan was bought before monthly maintenance began, so nothing is due on it.', code: 'nothing_due' },
      409,
    );
  }

  return startPayment(ctx, {
    plan: tenant.plan,
    amountCents: MAINTENANCE_FEE_CENTS,
    label: `${PLAN_DISPLAY[tenant.plan]?.label ?? tenant.plan} maintenance`,
    prefix: 'maint',
    months,
    zimraAddon: owned.zimraAddon,
  });
});

// POST /billing/webhook -- Paynow's resultUrl target. Mounted unauthenticated
// (see class docblock) -- this is an external POST from Paynow's own
// servers, which can never present a session cookie.
billingWebhookRoutes.post('/webhook', async (ctx) => {
  const body = await ctx.req.parseBody();
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === 'string') fields[k] = v;
  }

  try {
    verifyHash(fields, 'webhook');
  } catch (err) {
    // Do NOT say why in the response -- an attacker probing for the exact
    // validation failure reason is exactly what a generic 400 avoids.
    console.warn('Paynow webhook: hash verification failed', { reference: fields.reference });
    return ctx.json({ message: 'Invalid.' }, 400);
  }

  const subscription = await db.subscription.findFirst({
    where: { providerRef: fields.reference },
  });
  if (!subscription) {
    // Not necessarily an attack -- could be a retry for an old/cleaned-up
    // reference. 200 so Paynow doesn't retry forever on something that will
    // never resolve.
    console.warn('Paynow webhook: no subscription found for reference', fields.reference);
    return ctx.json({ message: 'Unknown reference.' }, 200);
  }

  if (!isPaidStatus(fields.status ?? '')) {
    // Cancelled/created/other non-paid statuses: nothing to activate yet,
    // leave the pending row as-is for a future update on the same reference.
    return ctx.json({ message: 'Acknowledged.' }, 200);
  }

  // Paynow sends more than one "paid" message for a payment (Paid, then
  // Awaiting Delivery / Delivered) and retries. Each payment may extend the
  // period only ONCE, or a single $5 would buy several months.
  if (subscription.status === 'active') {
    return ctx.json({ message: 'Acknowledged.' }, 200);
  }

  // Every payment buys 30-day periods -- one, or as many months as the
  // reference says (BYOD and maintenance can be paid ahead). A maintenance
  // payment (and a BYOD renewal) continues from the end of the period already
  // paid for, so paying early loses nothing; a plan bought for the first time
  // starts today -- for Standard/Premium that is the "first month included".
  const isMaintenance = subscription.providerRef?.startsWith('maint_') ?? false;
  const continuing = isMaintenance || subscription.plan === 'byod';
  const previous = continuing ? await paidSubscription(subscription.plan) : null;
  const months = continuing ? monthsFromReference(subscription.providerRef) : 1;
  const currentPeriodEnd = nextPeriodEnd(new Date(), previous?.currentPeriodEnd, months);

  await db.$transaction(async (tx) => {
    // Claim the row: if a concurrent delivery already activated it, do nothing.
    const claimed = await tx.subscription.updateMany({
      where: { id: subscription.id, status: { not: 'active' } },
      data: { status: 'active', currentPeriodEnd },
    });
    if (claimed.count === 0) return;
    await tx.tenant.update({
      where: { id: subscription.tenantId },
      data: { plan: subscription.plan },
    });
  });

  return ctx.json({ message: 'Acknowledged.' }, 200);
});
