/**
 * Run something that must not overlap with itself for one business.
 *
 * "Count what there is, and add one if there is room" is not safe on its own: ten
 * requests that arrive together all count the same number, all find room, and all add one.
 * (Measured: a business allowed 5 staff took 12; one allowed 5 branches took 11.) So the check
 * and the insert run inside one transaction that first takes a lock on the business's row;
 * a second request for the same business waits there until the first has finished, then counts
 * again and sees what the first added. Businesses never wait on each other.
 *
 * The same lock serialises a payment being applied to a business (domain/billing/activation.ts).
 */
import { db } from './db.js';

/**
 * Time a transaction is allowed to take, INCLUDING waiting for the lock. Prisma's default is 5s,
 * which a queue of several requests on a database a long round trip away (a development laptop
 * to Supabase) can exceed -- the ones that ran out answered with a 500. Generous, because a
 * lock is only ever held for a few statements.
 */
export const TRANSACTION_PATIENCE = { maxWait: 15_000, timeout: 60_000 } as const;

/** What `fn` is given: the transaction's own client. Use it, not `db`, for everything that belongs to the locked step. */
export type TenantTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export function withTenantLock<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
    return fn(tx);
  }, TRANSACTION_PATIENCE);
}
