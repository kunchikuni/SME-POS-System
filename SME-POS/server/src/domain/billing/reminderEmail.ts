/**
 * The words of the billing reminder emails — what a business is told as its
 * trial or paid period runs out. Pure (no sending, no database), so every
 * message can be read in a test.
 *
 * Every email says the same three things: what is happening and when, what it
 * costs, and that nothing is charged automatically — the owner pays when they
 * choose, from the link. The text-message versions (reminderSms) say the same
 * in a line.
 */
import type { AccessSummary } from './entitlementService.js';
import { MAINTENANCE_FEE_CENTS } from './maintenance.js';
import { PLAN_PRICES, usd } from './pricing.js';

export type ReminderStage = 'soon' | 'tomorrow' | 'ended' | 'pausing' | 'paused';

export interface ReminderEmailInput {
  stage: ReminderStage;
  kind: AccessSummary['kind'];
  businessName: string;
  ownerName: string | null;
  /** When the trial / paid period ends (ended). */
  endsAt: Date;
  /** When the tills pause (paused). */
  graceEndsAt: Date | null;
  payUrl: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "5 Oct 2026" — an unambiguous date, whatever the reader's locale. */
export const emailDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** What paying costs for this kind of period, as the email quotes it. */
function price(kind: AccessSummary['kind']): string | null {
  if (kind === 'maintenance') return usd(MAINTENANCE_FEE_CENTS);
  if (kind === 'monthly') return usd(PLAN_PRICES.byod.amountCents);
  return null; // a trial: they choose a plan
}

export function reminderEmail(i: ReminderEmailInput): { subject: string; html: string } {
  const cost = price(i.kind);
  const end = emailDate(i.endsAt);
  const tillsPause = i.graceEndsAt ? emailDate(i.graceEndsAt) : 'a few days from now';

  // What the owner is asked to do, in this kind's own words.
  const thing =
    i.kind === 'trial' ? 'free trial'
    : i.kind === 'maintenance' ? `monthly maintenance (${cost})`
    : 'monthly plan';
  const action =
    i.kind === 'trial' ? 'Choose a plan'
    : `Pay ${cost}`;
  const how =
    i.kind === 'trial'
      ? 'Choose a plan to keep going — your data stays safe either way.'
      : i.kind === 'maintenance'
        ? `Your ${cost} a month keeps your dashboard open and your tills syncing. Pay for 6 months and get 1 free, or 12 months and get 2 free — then there's nothing to remember for a long while.`
        : `Pay ${cost} to cover the next month. Pay for 6 months and get 1 free, or 12 months and get 2 free.`;

  let subject: string;
  let lead: string;
  switch (i.stage) {
    case 'soon':
      subject = i.kind === 'trial'
        ? `Your Wivae free trial ends on ${end}`
        : `Your Wivae ${i.kind === 'maintenance' ? `maintenance (${cost})` : 'monthly plan'} is due on ${end}`;
      lead = `Your ${thing} runs out on ${end}.`;
      break;
    case 'tomorrow':
      subject = i.kind === 'trial'
        ? 'Your Wivae free trial ends tomorrow'
        : `Your Wivae ${i.kind === 'maintenance' ? `maintenance (${cost})` : 'monthly plan'} is due tomorrow`;
      lead = `Your ${thing} runs out tomorrow, ${end}.`;
      break;
    case 'ended':
      subject = i.kind === 'trial'
        ? 'Your Wivae free trial has ended'
        : 'Your Wivae dashboard is locked — pay to reopen it';
      lead =
        `Your ${thing} ended on ${end}, so your dashboard is locked. ` +
        `Your tills keep selling until ${tillsPause}; after that, sales stay saved on each device and sync once you pay.`;
      break;
    case 'pausing':
      subject = `Your Wivae tills pause on ${tillsPause}`;
      lead =
        `Your ${thing} ended on ${end}, so your dashboard is locked, and your tills will pause on ${tillsPause}. ` +
        `Sales will still be saved on each device — they just won't sync until you pay.`;
      break;
    case 'paused':
      subject = 'Your Wivae tills have paused';
      lead =
        `Your ${thing} ended on ${end} and your tills have now paused. ` +
        `Nothing is lost: every sale is saved on the device and will sync as soon as you pay.`;
      break;
  }

  const hello = i.ownerName ? `Hi ${escapeHtml(i.ownerName.split(' ')[0])},` : 'Hi,';
  const html = `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
    <tr><td style="padding:28px 28px 8px;">
      <div style="font-size:13px;color:#64748b;">${escapeHtml(i.businessName)}</div>
      <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;">${escapeHtml(subject)}</h1>
    </td></tr>
    <tr><td style="padding:12px 28px 4px;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 12px;">${hello}</p>
      <p style="margin:0 0 12px;">${escapeHtml(lead)}</p>
      <p style="margin:0 0 12px;">${escapeHtml(how)}</p>
    </td></tr>
    <tr><td style="padding:8px 28px 20px;">
      <a href="${escapeHtml(i.payUrl)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px;">${escapeHtml(action)}</a>
    </td></tr>
    <tr><td style="padding:0 28px 24px;font-size:12px;line-height:1.5;color:#64748b;">
      Wivae never charges you automatically — you choose when to pay, from the link above.
      If you've already paid, you can ignore this; it can take a minute to show.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  return { subject, html };
}

/** "5 Oct" — no year: a text has room for little, and the date is always near. */
const smsDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * The text-message version: one short message, plain ASCII only (a single
 * accented or curly character turns it into a 70-character Unicode message,
 * which costs more and splits sooner). The business name is left out for the
 * same reason; the link says whose it is.
 */
export function reminderSms(i: ReminderEmailInput): string {
  const cost = price(i.kind);
  const end = smsDate(i.endsAt);
  const pause = i.graceEndsAt ? smsDate(i.graceEndsAt) : 'soon';
  const thing = i.kind === 'trial' ? 'free trial' : i.kind === 'maintenance' ? `${cost} maintenance` : `${cost} monthly plan`;
  const pay = i.kind === 'trial' ? 'Choose a plan' : 'Pay';

  switch (i.stage) {
    case 'soon':
      return `Wivae: your ${thing} ${i.kind === 'trial' ? 'ends' : 'is due'} on ${end}. ${pay}: ${i.payUrl}`;
    case 'tomorrow':
      return `Wivae: your ${thing} ${i.kind === 'trial' ? 'ends' : 'is due'} tomorrow (${end}). ${pay}: ${i.payUrl}`;
    case 'ended':
      return i.kind === 'trial'
        ? `Wivae: your free trial has ended. Choose a plan to unlock your dashboard; your tills keep selling until ${pause}. ${i.payUrl}`
        : `Wivae: your dashboard is locked. Pay ${cost} to reopen it; your tills keep selling until ${pause}. ${i.payUrl}`;
    case 'pausing':
      return `Wivae: your tills pause on ${pause}. Sales stay saved on the device and sync once you pay. ${i.payUrl}`;
    case 'paused':
      return `Wivae: your tills have paused. Sales are saved and will sync once you pay. ${i.payUrl}`;
  }
}
