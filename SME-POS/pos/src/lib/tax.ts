/**
 * VAT is inclusive: the shelf price (`product.price_cents`) is what the
 * customer pays. Tax is backed out of that price, not added on top — this is
 * Zimbabwean retail convention and a deliberate decision recorded in
 * docs/ARCHITECTURE.md §3, made after the reference designs disagreed with
 * each other about it.
 *
 * The rate is tenant-wide (Settings → General → Tax Rate), delivered with the
 * device session as `taxRateBps` (basis points: 1500 = 15%), and applies to
 * products with tax_class 'standard'. 'zero' and 'exempt' are always 0%,
 * regardless of the tenant rate — that's what those classes mean.
 */

export function taxRateFor(taxClass: string, tenantRateBps: number): number {
  if (taxClass === 'zero' || taxClass === 'exempt') return 0;
  return tenantRateBps;
}

/**
 * Back out VAT from an inclusive amount: vat = amount * rate / (100 + rate),
 * rate expressed in whole percent. Rounds half-up to the nearest cent so the
 * net + vat always reconciles exactly to the inclusive amount.
 */
export function vatFromInclusive(amountCents: number, rateBasisPoints: number): number {
  if (rateBasisPoints <= 0) return 0;
  const ratePercent = rateBasisPoints / 100;
  return Math.round((amountCents * ratePercent) / (100 + ratePercent));
}

/** The net (ex-VAT) amount for an inclusive total: amount - vat. */
export function netFromInclusive(amountCents: number, rateBasisPoints: number): number {
  return amountCents - vatFromInclusive(amountCents, rateBasisPoints);
}
