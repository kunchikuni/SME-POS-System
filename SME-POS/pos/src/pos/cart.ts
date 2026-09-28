import { lineTotal, sumCents } from '../lib/money';
import { taxRateFor, vatFromInclusive } from '../lib/tax';
import { uuid } from '../lib/uuid';
import type {
    PaymentMethod,
    Product,
    SaleCreateMutation,
    SaleCustomer,
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
    /** See PaymentPayload.received_cents. */
    received_cents?: number | null;
}

export function emptyCart(): Cart {
    return { lines: [] };
}

/**
 * How many of a product this till can sell right now: its local on-hand
 * level, or `undefined` for a product that doesn't track stock (no limit).
 *
 * A tracked product with NO local level row counts as 0, not unlimited —
 * the tills used to treat a missing row as "no limit", so a tracked product
 * the branch had never stocked could be sold freely. Negative levels (two
 * offline tills both selling the last unit) also clamp to 0.
 */
export function availableFor(product: Product, stock: ReadonlyMap<string, number>): number | undefined {
    if (!product.track_stock) return undefined;
    return Math.max(0, stock.get(product.id) ?? 0);
}

/** True when a cart line already holds everything on hand — the "+" is disabled. */
export function atStockLimit(line: CartLine, stock: ReadonlyMap<string, number>): boolean {
    const available = availableFor(line.product, stock);
    return available !== undefined && line.qty >= available;
}

export function qtyInCart(cart: Cart, productId: string): number {
    return cart.lines.find((l) => l.product.id === productId)?.qty ?? 0;
}

/**
 * Add one of a product, merging into the existing line if present.
 * With `available`, refuses (returns the cart unchanged) once the line holds
 * that many — the tills pass availableFor() so a tap, a "+" or a scan can
 * never put more in the cart than is on hand.
 */
export function addProduct(cart: Cart, product: Product, available?: number): Cart {
    const existing = cart.lines.find((l) => l.product.id === product.id);
    const next = (existing?.qty ?? 0) + 1;
    if (available !== undefined && next > available) return cart;
    const lines = existing
        ? cart.lines.map((l) => (l.product.id === product.id ? { ...l, qty: next } : l))
        : [...cart.lines, { product, qty: 1 }];
    return { lines };
}

/**
 * Set an explicit quantity; a qty of 0 or less removes the line.
 * With `available`, the quantity is clamped to it (0 available removes it).
 */
export function setQty(cart: Cart, productId: string, qty: number, available?: number): Cart {
    const capped = available !== undefined ? Math.min(qty, available) : qty;
    if (capped <= 0) return removeLine(cart, productId);
    return {
        lines: cart.lines.map((l) => (l.product.id === productId ? { ...l, qty: capped } : l)),
    };
}

/** "Only 10 Coke in stock" / "Coke is out of stock" — shared wording for every till. */
export function stockLimitMessage(product: Product, available: number): string {
    return available <= 0 ? `${product.name} is out of stock.` : `Only ${available} ${product.name} in stock.`;
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
        /**
         * Whether this specific sale should create a kitchen ticket. Defaults
         * false — a plain sale never routes to the kitchen unless the till
         * explicitly asked for it (RetailTill's "send to kitchen" action, or
         * RestaurantTill's default checkout, which sets this true unless the
         * cashier picks "quick sale, skip kitchen"). Independent of branch
         * mode — see SalePayload.route_to_kitchen.
         */
        routeToKitchen?: boolean;
        gratuityCents?: number;
        tenantRateBps: number;
        /** Who owes the 'credit' part of the payments. Ignored when nothing is on credit. */
        customer?: SaleCustomer | null;
    },
): SaleCreateMutation {
    const onCredit = options.payments.some((p) => p.method === 'credit' && p.amount_cents > 0);
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
            route_to_kitchen: options.routeToKitchen ?? false,
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
                received_cents: p.received_cents ?? null,
                currency: options.currency,
            })),
            customer: onCredit ? options.customer ?? null : null,
        },
    };
}
