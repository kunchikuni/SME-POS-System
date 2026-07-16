import { db, type OutboxEntry } from '../db/database';
import type { Mutation } from '../types/contract';

/**
 * The outbox is the durable delivery queue. A sale is only ever "made" once its
 * mutation is in here; sending is a separate, retryable concern. Because the
 * mutation id is the sale's client-generated UUID, re-sending an already-applied
 * mutation is a no-op on the server — so we can retry freely without bookkeeping.
 */

/** Enqueue a mutation for delivery. Idempotent on mutationId. */
export async function enqueue(mutationId: string, mutation: Mutation): Promise<void> {
  const entry: OutboxEntry = {
    mutationId,
    type: mutation.type,
    payload: mutation,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await db.outbox.put(entry);
}

/** Pending mutations, oldest first — the order they should be delivered in. */
export async function pending(): Promise<OutboxEntry[]> {
  return db.outbox.orderBy('createdAt').toArray();
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count();
}

/** Remove entries the server has acknowledged as durably applied. */
export async function ack(mutationIds: string[]): Promise<void> {
  if (mutationIds.length === 0) return;
  await db.outbox.bulkDelete(mutationIds);
}

/** Record a delivery attempt that failed, so we can surface stuck items. */
export async function markAttempt(mutationId: string, error: string): Promise<void> {
  const entry = await db.outbox.get(mutationId);
  if (!entry) return;
  await db.outbox.update(mutationId, {
    attempts: entry.attempts + 1,
    lastError: error,
  });
}
