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

/** All pending mutations, oldest first — the canonical delivery order. */
export async function pending(): Promise<OutboxEntry[]> {
  return db.outbox.orderBy('createdAt').toArray();
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count();
}

/**
 * Returns pending entries that are ready to retry right now, applying
 * exponential backoff so a persistently-failing entry doesn't hammer the
 * server on every 30-second poll cycle.
 *
 * Schedule: `min(2^n * 30s, 3600s)` where n = attempts.
 *   n=0 → 30s  (new entry; effectively immediate on next poll)
 *   n=1 → 60s
 *   n=2 → 120s
 *   n=5 → 960s (~16 min)
 *   n=7+ → 3600s (1 h cap)
 *
 * Entries without `lastAttemptAt` (brand new, or pre-v3 rows) are always
 * included — treating absent as "never attempted" is safe because those
 * entries have never caused a server error that would merit a delay.
 */
export async function pendingRetryable(now: Date = new Date()): Promise<OutboxEntry[]> {
  const all = await pending();
  return all.filter((entry) => {
    if (!entry.lastAttemptAt) return true; // never failed — always eligible
    const backoffMs = Math.min(Math.pow(2, entry.attempts) * 30_000, 3_600_000);
    const nextRetryAt = new Date(entry.lastAttemptAt).getTime() + backoffMs;
    return now.getTime() >= nextRetryAt;
  });
}

/**
 * Returns entries that have failed enough times to be considered "stuck" —
 * the sync engine will no longer retry them on its own schedule, and the UI
 * should surface an OutboxStuckBanner prompting the operator to contact support.
 *
 * Threshold: 5 attempts. At that point the backoff is ~16 min, and something
 * is genuinely wrong (server error, shape mismatch, etc.) that won't self-heal.
 */
export async function pendingStuck(): Promise<OutboxEntry[]> {
  const all = await pending();
  return all.filter((e) => e.attempts >= 5);
}

/**
 * Operator-initiated "retry now": clears the attempt count and backoff window
 * on every entry so the next flush sends them all immediately. Used once the
 * underlying cause (server down, schema fix deployed) has been resolved —
 * otherwise a stuck entry could sit out up to an hour of backoff.
 */
export async function resetBackoff(): Promise<void> {
  await db.outbox.toCollection().modify((entry) => {
    entry.attempts = 0;
    delete entry.lastAttemptAt;
  });
}

/** Remove entries the server has acknowledged as durably applied. */
export async function ack(mutationIds: string[]): Promise<void> {
  if (mutationIds.length === 0) return;
  await db.outbox.bulkDelete(mutationIds);
}

/** Record a delivery attempt that failed, recording timestamp for backoff. */
export async function markAttempt(mutationId: string, error: string): Promise<void> {
  const entry = await db.outbox.get(mutationId);
  if (!entry) return;
  await db.outbox.update(mutationId, {
    attempts: entry.attempts + 1,
    lastError: error,
    lastAttemptAt: new Date().toISOString(),
  });
}
