import { lineTotal, sumCents } from '../lib/money';
import { taxRateFor, vatFromInclusive } from '../lib/tax';
import { uuid } from '../lib/uuid';
import type {
  PaymentMethod,
  Product,
  SaleCreateMutation,
  SaleLinePayload,
} from '../types/contract';

/**
 * The cart is plain data and pure functions — no framework, no I/O — so it is
 * trivially testable and the checkout math lives in one place. Totals are always
 * integer cents. The final act, buildSaleMutation, stamps client UUIDs on the
 * sale, every line, and (for tracked products) a stock movement, which is what
 * makes the resulting push idempotent (docs/ARCHITECTURE.md §5.2, §6).
 *
 * VAT is inclusive (docs §3): `product.price_cents` is what the customer pays.
 * `total_cents` is simply the sum of shelf prices (+ gratuity); `subtotal_cents`
 * and `tax_cents` are the net/VAT breakdown backed OUT of that total, for the
 * receipt and fiscal record — they never change what's charged.
 */

export interface CartLine {
  product: Product;
  qty: number;
}

export interface Cart {
  lines: CartLine[];
}

export interface CartTotals {
  /** Net (ex-VAT) — a breakdown figure, not what's charged. */
  subtotal_cents: number;
  /** VAT backed out of the inclusive total — a breakdown figure. */
  tax_cents: number;
  /** What the customer actually pays: sum of shelf (inclusive) prices. */
  total_cents: number;
  count: number;
}

export interface PaymentInput {
  method: PaymentMethod;
  amount_cents: number;
}

export function emptyCart(): Cart {
  return { lines: [] };
}

/** Add one of a product, merging into the existing line if present. */
export function addProduct(cart: Cart, product: Product): Cart {
  const existing = cart.lines.find((l) => l.product.id === product.id);
  const lines = existing
    ? cart.lines.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l))
    : [...cart.lines, { product, qty: 1 }];
  return { lines };
}

/** Set an explicit quantity; a qty of 0 or less removes the line. */
export function setQty(cart: Cart, productId: string, qty: number): Cart {
  if (qty <= 0) return removeLine(cart, productId);
  return {
    lines: cart.lines.map((l) => (l.product.id === productId ? { ...l, qty } : l)),
  };
}

export function removeLine(cart: Cart, productId: string): Cart {
  return { lines: cart.lines.filter((l) => l.product.id !== productId) };
}

/**
 * @param tenantRateBps The tenant's configured VAT rate (Settings → General),
 *   in basis points. Only applies to tax_class 'standard'; 'zero'/'exempt'
 *   products never carry VAT regardless of this rate.
 */
export function cartTotals(cart: Cart, tenantRateBps: number): CartTotals {
  const grossLineTotals = cart.lines.map((l) => lineTotal(l.product.price_cents, l.qty));
  const vatPerLine = cart.lines.map((l, i) =>
    vatFromInclusive(grossLineTotals[i], taxRateFor(l.product.tax_class, tenantRateBps)),
  );

  const total = sumCents(grossLineTotals);
  const tax = sumCents(vatPerLine);

  return {
    subtotal_cents: total - tax,
    tax_cents: tax,
    total_cents: total,
    count: cart.lines.reduce((n, l) => n + l.qty, 0),
  };
}

/**
 * Freeze the cart into an immutable sale mutation ready for the outbox. The
 * server overrides branch_id/device_id from the token and does not recompute
 * money, so what we send here is exactly what is recorded.
 */
export function buildSaleMutation(
  cart: Cart,
  options: {
    cashierId: string | null;
    currency: string;
    payments: PaymentInput[];
    tableId?: string | null;
    gratuityCents?: number;
    tenantRateBps: number;
  },
): SaleCreateMutation {
  const totals = cartTotals(cart, options.tenantRateBps);
  const occurredAt = new Date().toISOString();
  const gratuity = options.gratuityCents ?? 0;

  const lines: SaleLinePayload[] = cart.lines.map((l) => ({
    id: uuid(),
    product_id: l.product.id,
    name: l.product.name,
    qty: l.qty,
    unit_price_cents: l.product.price_cents,
    line_total_cents: lineTotal(l.product.price_cents, l.qty),
    movement_id: l.product.track_stock ? uuid() : undefined,
  }));

  return {
    type: 'sale.create',
    sale: {
      id: uuid(),
      cashier_id: options.cashierId,
      table_id: options.tableId ?? null,
      subtotal_cents: totals.subtotal_cents,
      tax_cents: totals.tax_cents,
      gratuity_cents: gratuity,
      total_cents: totals.total_cents + gratuity,
      currency: options.currency,
      occurred_at: occurredAt,
      lines,
      payments: options.payments.map((p) => ({
        id: uuid(),
        method: p.method,
        amount_cents: p.amount_cents,
        currency: options.currency,
      })),
    },
  };
}
