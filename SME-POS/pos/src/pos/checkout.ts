import { db } from '../db/database';
import { syncManager } from '../sync/syncManager';
import { buildSaleMutation, type Cart, type PaymentInput } from './cart';
import type { SaleCustomer, SalePayload } from '../types/contract';

/** A cart line asks for more than this till has on hand. `message` is cashier-facing. */
export class InsufficientStockError extends Error {
  constructor(
    public productName: string,
    public available: number,
  ) {
    super(
      available <= 0
        ? `${productName} is out of stock. Remove it to finish the sale.`
        : `Only ${available} ${productName} in stock. Reduce the quantity to finish the sale.`,
    );
    this.name = 'InsufficientStockError';
  }
}

/** A credit sale with no customer to owe it. */
export class CreditCustomerRequiredError extends Error {
  constructor() {
    super('Enter the customer’s name for a credit sale.');
    this.name = 'CreditCustomerRequiredError';
  }
}

/** The cashier-facing message for a failed completeSale(). */
export function saleErrorMessage(err: unknown): string {
  return err instanceof InsufficientStockError || err instanceof CreditCustomerRequiredError
    ? err.message
    : 'Couldn’t save the sale. Please try again.';
}

/**
 * Complete a sale. This is the offline hot path, so correctness matters:
 *
 *  - The sale, its outbox entry, and the local stock decrement are written in
 *    one Dexie transaction — either all land or none do.
 *  - Stock is decremented optimistically so the till reflects the sale
 *    instantly while offline. The server ledger stays authoritative: the next
 *    pull replaces local levels with SUM(delta), which already includes this
 *    sale once its push is acked (flush runs before pull), so there is no
 *    double-count.
 *  - Sync is fired but not awaited — a completed sale must never block on the
 *    network. Offline, it simply waits in the outbox.
 */
export async function completeSale(
  cart: Cart,
  options: {
    cashierId: string | null;
    currency?: string;
    payments: PaymentInput[];
    tableId?: string | null;
    routeToKitchen?: boolean;
    gratuityCents?: number;
    tenantRateBps: number;
    /** Required when any payment is 'credit'. */
    customer?: SaleCustomer | null;
  },
): Promise<SalePayload> {
  const creditCents = options.payments
    .filter((p) => p.method === 'credit')
    .reduce((sum, p) => sum + p.amount_cents, 0);
  if (creditCents > 0 && !options.customer?.name.trim()) {
    // The server can't attach a nameless debt to anyone — it would record the
    // sale with the credit untracked. Refuse here instead, before saving.
    throw new CreditCustomerRequiredError();
  }

  const mutation = buildSaleMutation(cart, {
    cashierId: options.cashierId,
    currency: options.currency ?? 'USD',
    payments: options.payments,
    tableId: options.tableId ?? null,
    routeToKitchen: options.routeToKitchen ?? false,
    gratuityCents: options.gratuityCents ?? 0,
    tenantRateBps: options.tenantRateBps,
    customer: options.customer ?? null,
  });
  const sale = mutation.sale;

  await db.transaction('rw', [db.sales, db.outbox, db.stock, db.customers], async () => {
    // Last line of defence against overselling, checked against the level
    // in the SAME transaction that decrements it. The cart caps quantities
    // as they're added, but stock can drop while a cart is open (a pull
    // bringing another till's sales in). Only tracked lines carry a
    // movement_id. Throwing here aborts the whole transaction: nothing saved.
    for (const line of sale.lines) {
      if (line.product_id && line.movement_id) {
        const onHand = Math.max(0, (await db.stock.get(line.product_id))?.quantity ?? 0);
        if (line.qty > onHand) throw new InsufficientStockError(line.name, onHand);
      }
    }

    await db.sales.put({ ...sale, sync: 'pending' });

    await db.outbox.put({
      mutationId: sale.id,
      type: mutation.type,
      payload: mutation,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });

    for (const line of sale.lines) {
      if (line.product_id && line.movement_id) {
        const level = await db.stock.get(line.product_id);
        if (level) {
          await db.stock.put({ ...level, quantity: level.quantity - line.qty });
        }
      }
    }

    // Credit: create/bump the customer locally so the debt shows on this
    // till immediately (and offline) — e.g. in Record payment. Same
    // optimistic pattern as the stock decrement above; the next pull replaces
    // it with the server's balance, which includes this sale once acked.
    if (creditCents > 0 && sale.customer) {
      const existing = await db.customers.get(sale.customer.id);
      await db.customers.put({
        id: sale.customer.id,
        name: sale.customer.name,
        phone: sale.customer.phone,
        balance_cents: (existing?.balance_cents ?? 0) + creditCents,
      });
    }
  });

  void syncManager.sync(); // fire-and-forget; safe offline, retries via outbox

  return sale;
}
