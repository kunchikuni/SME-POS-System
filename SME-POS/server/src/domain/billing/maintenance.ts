/**
 * Monthly upkeep for Standard and Premium.
 *
 * Both are bought once — the hardware and the first month are included — and
 * from the second month on the business pays a monthly maintenance fee to keep
 * the dashboard open and its tills syncing. BYOD already pays every month, so
 * it is not charged this on top.
 *
 * The fee differs by plan. At launch it was set at about 2 to 2.5 times the
 * estimated cost to serve a business at around 30 businesses (hosting split
 * across them, Paynow's fee on the payment, reminders, and support time) --
 * roughly $3 for Standard and $5 for Premium. Premium costs more to serve:
 * ZIMRA fiscalisation upkeep, payroll, and priority support. The multiple grows
 * as the business count does, since hosting is shared; revisit these figures
 * against the real bills. The fee is NOT shown on the marketing site
 * (only "plus a monthly maintenance fee"); owners see their own plan's figure in the
 * dashboard, in reminders and on the page where they pay.
 *
 * Paynow cannot charge anyone again on its own (see lib/paynow.ts), so
 * "monthly" works like this: every payment buys one or more 30-day periods, and
 * the business pays for the next. Nothing is charged automatically — the
 * reminder emails (reminders.ts) and paying several months ahead are what keep
 * that from being forgotten.
 */

/** The monthly maintenance fee, in cents, by plan. ('pro' is the old name for Premium.) */
export const MAINTENANCE_FEES_CENTS: Readonly<Record<string, number>> = {
  standard: 700,
  premium: 1200,
  pro: 1200,
};

/** What this plan pays each month to keep going; null for a plan that pays none (BYOD, a trial). */
export const maintenanceFeeCents = (plan: string): number | null =>
  Object.hasOwn(MAINTENANCE_FEES_CENTS, plan) ? MAINTENANCE_FEES_CENTS[plan] : null;

export const BILLING_PERIOD_DAYS = 30;
const DAY_MS = 86_400_000;

/** The numbers of months a business may pay for in one go. */
export const PREPAY_OPTIONS = [1, 3, 6, 12] as const;
export const MAX_PREPAY_MONTHS = 12;

/**
 * Paying ahead earns free months — pay for 6 and get 1 free, pay for 12 and
 * get 2 free (about 17% off). Why it is worth giving: Paynow takes 2.5% of a
 * mobile-money payment and 3.5% + 50c of a card payment, so a $7 card payment
 * loses about 11% to fees where one $70 payment loses about 4%; and a business
 * that has paid a year ahead is a business that has not lapsed.
 *
 * The business is covered for `months`; it is charged for `billedMonths(months)`.
 */
export const PREPAY_FREE_MONTHS: Record<number, number> = { 6: 1, 12: 2 };

export const freeMonths = (months: number): number => PREPAY_FREE_MONTHS[months] ?? 0;
export const billedMonths = (months: number): number => months - freeMonths(months);

/** Plans bought once, then kept running by the monthly maintenance fee. */
export function paysMaintenance(plan: string): boolean {
  return Object.hasOwn(MAINTENANCE_FEES_CENTS, plan);
}

/**
 * When the period a payment buys ends: `months` months on from whichever is
 * later — now, or the end of the period already paid for. Paying early
 * therefore never wastes the days left, and paying late is not back-billed: a
 * business that lapsed for two months pays for one and gets one month from today.
 */
export function nextPeriodEnd(now: Date, paidThrough?: Date | null, months = 1): Date {
  const start = paidThrough && paidThrough > now ? paidThrough : now;
  return new Date(start.getTime() + months * BILLING_PERIOD_DAYS * DAY_MS);
}

/** How many months a payment reference was made out for (`..._m3`); one when it says nothing. */
export function monthsFromReference(reference: string | null | undefined): number {
  const m = /_m(\d{1,2})$/.exec(reference ?? '');
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= MAX_PREPAY_MONTHS ? n : 1;
}
