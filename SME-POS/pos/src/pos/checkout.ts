import { db } from '../db/database';
import { syncManager } from '../sync/syncManager';
import { buildSaleMutation, type Cart, type PaymentInput } from './cart';
import type { SalePayload } from '../types/contract';

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
    gratuityCents?: number;
    tenantRateBps: number;
  },
): Promise<SalePayload> {
  const mutation = buildSaleMutation(cart, {
    cashierId: options.cashierId,
    currency: options.currency ?? 'USD',
    payments: options.payments,
    tableId: options.tableId ?? null,
    gratuityCents: options.gratuityCents ?? 0,
    tenantRateBps: options.tenantRateBps,
  });
  const sale = mutation.sale;

  await db.transaction('rw', db.sales, db.outbox, db.stock, async () => {
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
  });

  void syncManager.sync(); // fire-and-forget; safe offline, retries via outbox

  return sale;
}
