/**
 * What a restaurant branch starts with.
 *
 * A restaurant till opens to its floor plan, and an order is started by tapping a table. A branch with
 * no tables would show "No tables yet" and nothing to tap -- and there is no page in the dashboard to
 * make them -- so a restaurant branch is given a set of tables when it is created, or switched to
 * restaurant mode. T1..T10, in one unnamed section: enough to start taking orders the same day (the
 * till also has a Takeaway button that needs no table). Renaming, adding and removing tables is a
 * dashboard job that has not been built.
 */
import crypto from 'node:crypto';
import type { db } from '../lib/db.js';

export const DEFAULT_TABLE_COUNT = 10;

/** The starting tables of one branch, ready for `restaurantTable.createMany`. */
export function defaultTableRows(tenantId: string, branchId: string, count = DEFAULT_TABLE_COUNT) {
  return Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    tenantId,
    branchId,
    name: `T${i + 1}`,
    sort: i + 1,
  }));
}

/**
 * Gives a restaurant branch its starting tables -- once. Returns how many it made.
 *
 * It counts EVERY table the branch has ever had, removed ones included: a branch that has tables, or
 * that once had some and had them taken away on purpose, is left exactly as it is. So switching a branch
 * to restaurant mode a second time, or back and forth, never piles up duplicates or brings back
 * tables someone removed.
 */
export async function ensureDefaultTables(
  client: Pick<typeof db, 'restaurantTable'>,
  tenantId: string,
  branchId: string,
): Promise<number> {
  const existing = await client.restaurantTable.count({ where: { tenantId, branchId } });
  if (existing > 0) return 0;
  const rows = defaultTableRows(tenantId, branchId);
  await client.restaurantTable.createMany({ data: rows });
  return rows.length;
}
