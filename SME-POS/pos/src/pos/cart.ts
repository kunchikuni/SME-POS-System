import { lineTotal, sumCents, taxOf } from '../lib/money';
import { taxRateFor } from '../lib/tax';
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
 */

export interface CartLine {
  product: Product;
  qty: number;
}

export interface Cart {
  lines: CartLine[];
}

export interface CartTotals {
  subtotal_cents: number;
  tax_cents: number;
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

export function cartTotals(cart: Cart): CartTotals {
  const lineTotals = cart.lines.map((l) => lineTotal(l.product.price_cents, l.qty));
  const taxes = cart.lines.map((l) =>
    taxOf(lineTotal(l.product.price_cents, l.qty), taxRateFor(l.product.tax_class)),
  );
  const subtotal = sumCents(lineTotals);
  const tax = sumCents(taxes);
  return {
    subtotal_cents: subtotal,
    tax_cents: tax,
    total_cents: subtotal + tax,
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
  },
): SaleCreateMutation {
  const totals = cartTotals(cart);
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
