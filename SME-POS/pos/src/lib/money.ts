/**
 * Money is integer minor units, everywhere. Floats silently lose cents and a
 * POS cannot (docs/ARCHITECTURE.md §3). Every function here takes and returns
 * whole `cents`; formatting to a decimal string happens only at the edge.
 */

const SYMBOLS: Record<string, string> = {
  USD: '$',
  ZWL: 'Z$',
};

/** Multiply cents by a whole quantity. */
export function lineTotal(unitPriceCents: number, qty: number): number {
  return unitPriceCents * qty;
}

/**
 * Apply a tax rate expressed in basis points (e.g. 1500 = 15%) to a cents
 * amount, rounding half-up to the nearest cent. Integer math throughout.
 */
export function taxOf(amountCents: number, rateBasisPoints: number): number {
  if (rateBasisPoints <= 0) return 0;
  return Math.round((amountCents * rateBasisPoints) / 10_000);
}

export function sumCents(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

/** Format cents as a display string, e.g. formatMoney(150, 'USD') === '$1.50'. */
export function formatMoney(cents: number, currency = 'USD'): string {
  const symbol = SYMBOLS[currency] ?? '';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const decimal = (abs / 100).toFixed(2);
  return `${sign}${symbol}${decimal}`;
}

/** Parse a user-typed decimal string (e.g. "1.50") into integer cents. */
export function toCents(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  return Math.round(parseFloat(cleaned) * 100);
}
