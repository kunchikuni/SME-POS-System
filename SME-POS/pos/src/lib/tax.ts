/**
 * Tax is resolved per product `tax_class` and returned in basis points so the
 * cart can compute integer-cent tax. The server does NOT recompute the sale —
 * it stores the client's snapshot — so this is the single source of truth for
 * tax at the point of sale.
 *
 * MVP ships everything at zero. Real VAT/ZIMRA rates are configured per tenant
 * in a later phase; wiring the lookup now means that becomes data, not code.
 */
const RATES_BASIS_POINTS: Record<string, number> = {
  standard: 0, // e.g. 1500 for Zimbabwe 15% VAT, set per tenant later
  zero: 0,
  exempt: 0,
};

export function taxRateFor(taxClass: string): number {
  return RATES_BASIS_POINTS[taxClass] ?? 0;
}
