import Dexie, { type Table } from 'dexie';
import type {
  Category,
  Mutation,
  MutationType,
  Product,
  SalePayload,
  StaffMember,
  StockLevel,
} from '../types/contract';

/**
 * The till's local database — the only durable, structured, large-capacity
 * store the browser offers (docs/ARCHITECTURE.md §3). It holds a mirror of the
 * server catalog plus everything written offline. Two ideas keep it correct:
 *
 *  - `outbox` is the delivery queue. Every local mutation lands here and stays
 *    until the server acks it. Retries are safe because ids are client-minted.
 *  - `sales` is the till's own immutable record for receipts and history; its
 *    `sync` flag flips to 'synced' when the matching outbox entry is acked.
 */

export type SyncStatus = 'pending' | 'synced';

/** A completed sale as stored locally: the wire payload plus local bookkeeping. */
export interface LocalSale extends SalePayload {
  sync: SyncStatus;
}

/** One queued, not-yet-acknowledged mutation. `mutationId` is its idempotency key. */
export interface OutboxEntry {
  mutationId: string;
  type: MutationType;
  payload: Mutation;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

/** Small key/value store for the sync cursor and similar bookkeeping. */
export interface MetaRow {
  key: string;
  value: unknown;
}

export class PosDatabase extends Dexie {
  categories!: Table<Category, string>;
  products!: Table<Product, string>;
  stock!: Table<StockLevel, string>;
  staff!: Table<StaffMember, string>;
  sales!: Table<LocalSale, string>;
  outbox!: Table<OutboxEntry, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('wivae-pos');

    // Only indexed fields are listed; Dexie stores the whole object regardless.
    // NB: is_active is intentionally NOT indexed — IndexedDB can't key on a
    // boolean, so we filter active products in JS (the catalog is SME-sized).
    this.version(1).stores({
      categories: 'id, name',
      products: 'id, sku, barcode, category_id',
      stock: 'product_id',
      staff: 'id',
      sales: 'id, sync, occurred_at',
      outbox: 'mutationId, createdAt',
      meta: 'key',
    });
  }
}

export const db = new PosDatabase();

// ── Meta helpers (typed access to the key/value table) ───────────────────────

const CURSOR_KEY = 'cursor';

export async function getCursor(): Promise<string | null> {
  const row = await db.meta.get(CURSOR_KEY);
  return (row?.value as string | undefined) ?? null;
}

export async function setCursor(cursor: string): Promise<void> {
  await db.meta.put({ key: CURSOR_KEY, value: cursor });
}

/** True once a bootstrap has populated the catalog — i.e. the till is usable. */
export async function isProvisioned(): Promise<boolean> {
  return (await getCursor()) !== null && (await db.products.count()) >= 0;
}
