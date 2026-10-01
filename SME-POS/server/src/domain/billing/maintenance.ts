/**
 * Monthly upkeep for Standard and Premium.
 *
 * Both are bought once — the hardware and the first month are included — and
 * from the second month on the business pays a flat maintenance fee to keep the
 * dashboard open and its tills syncing. BYOD already pays every month, so it is
 * not charged this on top.
 *
 * Paynow cannot charge anyone again on its own (see lib/paynow.ts), so
 * "monthly" works like this: every payment buys one or more 30-day periods, and
 * the business pays for the next. Nothing is charged automatically — the
 * reminder emails (reminders.ts) and paying several months ahead are what keep
 * that from being forgotten.
 */

export const MAINTENANCE_FEE_CENTS = 500;

export const BILLING_PERIOD_DAYS = 30;
const DAY_MS = 86_400_000;

/** The numbers of months a business may pay for in one go. */
export const PREPAY_OPTIONS = [1, 3, 6, 12] as const;
export const MAX_PREPAY_MONTHS = 12;

/**
 * Paying ahead earns free months — pay for 6 and get 1 free, pay for 12 and
 * get 2 free (about 17% off). Why it is worth giving: Paynow takes 2.5% of a
 * mobile-money payment and 3.5% + 50c of a card payment, so a $5 card payment
 * loses 13.5% to fees where one $50 payment loses 4.5%; and a business that
 * has paid a year ahead is a business that has not lapsed.
 *
 * The business is covered for `months`; it is charged for `billedMonths(months)`.
 */
export const PREPAY_FREE_MONTHS: Record<number, number> = { 6: 1, 12: 2 };

export const freeMonths = (months: number): number => PREPAY_FREE_MONTHS[months] ?? 0;
export const billedMonths = (months: number): number => months - freeMonths(months);

/** Plans bought once, then kept running by the monthly maintenance fee. */
export function paysMaintenance(plan: string): boolean {
  return plan === 'standard' || plan === 'premium' || plan === 'pro';
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
