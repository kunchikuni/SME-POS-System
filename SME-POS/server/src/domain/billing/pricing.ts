/**
 * What Wivae charges, in one place — read by the billing routes (which charge
 * it) and the reminder emails (which quote it). Prices are set here on the
 * server and NEVER trusted from the client: a request body carrying its own
 * "amount" would let anyone pay $0.01 for Premium.
 *
 * Must stay in sync with the marketing site (marketing/src/pages/index.astro):
 * BYOD $19.99 for each month; Standard $199.99 and Premium $249 bought once —
 * hardware and the first month included, then the monthly maintenance fee
 * (maintenance.ts).
 */
export const PLAN_PRICES: Record<string, { amountCents: number; recurring: boolean; label: string }> = {
  byod: { amountCents: 1999, recurring: true, label: 'BYOD (monthly)' },
  standard: { amountCents: 19999, recurring: false, label: 'Standard' },
  premium: { amountCents: 24900, recurring: false, label: 'Premium' },
};

/** "$5", "$19.99" — whole dollars lose their cents. */
export const usd = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
