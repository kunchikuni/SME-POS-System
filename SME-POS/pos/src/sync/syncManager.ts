import { api, ApiError, OfflineError } from './apiClient';
import { ack, markAttempt, pending, pendingCount } from './outbox';
import { mergeTenantInfo } from './session';
import { db, getCursor, setCursor } from '../db/database';
import type { BootstrapResponse, Product, PullResponse, Table } from '../types/contract';

/**
 * Orchestrates the three sync operations against the local store:
 *
 *   bootstrap — one full snapshot when a device is first provisioned
 *   pull      — server-authoritative catalog/stock changes since our cursor
 *   flush     — drain the outbox to the server, idempotently
 *
 * There is deliberately no conflict resolution: sales are insert-only and stock
 * is a summing ledger, so offline writes never contend (docs/ARCHITECTURE.md §6).
 * Catalog flows one way (server → till), so last-write-wins on pull is correct.
 */

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  pending: number;
  lastSyncedAt: string | null;
  needsReauth: boolean;
  /**
   * true once a background sync detects the owner changed tenant mode,
   * currency, tax rate, or branding since this device was paired (or last
   * reloaded). Deliberately NOT auto-applied — a mode switch restructures
   * the whole till, and the cart lives in React state only, so a silent
   * reload could lose an in-progress sale. The UI surfaces this as a
   * dismissible notice the cashier acts on at a safe moment instead.
   */
  settingsChanged: boolean;
}

type Listener = (status: SyncStatus) => void;

export class SyncManager {
  private status: SyncStatus = {
    online: navigator.onLine,
    syncing: false,
    pending: 0,
    lastSyncedAt: null,
    needsReauth: false,
    settingsChanged: false,
  };

  private listeners = new Set<Listener>();
  private pollHandle: number | null = null;

  // ── Observation ────────────────────────────────────────────────────────────

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private emit(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener(this.status);
  }

  private async refreshPending(): Promise<void> {
    this.emit({ pending: await pendingCount() });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /** Wire up connectivity events and a gentle background poll. */
  start(pollMs = 30_000): void {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    void this.refreshPending();
    if (this.pollHandle === null) {
      this.pollHandle = window.setInterval(() => void this.sync(), pollMs);
    }
    if (navigator.onLine) void this.sync();
  }

  stop(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.pollHandle !== null) {
      window.clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  private handleOnline = (): void => {
    this.emit({ online: true });
    void this.sync();
  };

  private handleOffline = (): void => {
    this.emit({ online: false });
  };

  // ── Operations ─────────────────────────────────────────────────────────────

  /** Full snapshot for a freshly provisioned device. Replaces local catalog. */
  async bootstrap(): Promise<void> {
    const snapshot = await api.bootstrap();
    await this.applyBootstrap(snapshot);
    await setCursor(snapshot.cursor);
    this.emit({ lastSyncedAt: new Date().toISOString() });
  }

  /**
   * Push then pull. Push first so the server has our sales before we ask what
   * changed; both steps tolerate being offline and simply defer.
   */
  async sync(): Promise<void> {
    if (this.status.syncing) return;
    this.emit({ syncing: true });
    try {
      await this.flush();
      await this.pull();
      await this.refreshTenantInfo();
      this.emit({ lastSyncedAt: new Date().toISOString(), online: true });
    } catch (error) {
      this.handleError(error);
    } finally {
      this.emit({ syncing: false });
      await this.refreshPending();
    }
  }

  /**
   * Refreshes the stored tenant mode/currency/tax-rate/theme from the server
   * on every sync cycle — see session.ts for why this exists. Failure here
   * (offline, etc.) is swallowed on purpose: it must never abort flush/pull,
   * which are the operations that actually matter for not losing a sale.
   */
  private async refreshTenantInfo(): Promise<void> {
    try {
      const { tenant } = await api.session();
      if (mergeTenantInfo(tenant)) {
        this.emit({ settingsChanged: true });
      }
    } catch {
      // Non-fatal: catalog/stock/sales sync already succeeded above.
    }
  }

  /** Drain the outbox. Acked ids are removed and their local sale marked synced. */
  async flush(): Promise<void> {
    const entries = await pending();
    if (entries.length === 0) return;

    const mutations = entries.map((e) => e.payload);

    let result;
    try {
      result = await api.push(mutations);
    } catch (error) {
      if (error instanceof OfflineError) return; // retry later, nothing wrong
      for (const entry of entries) {
        await markAttempt(entry.mutationId, describe(error));
      }
      throw error;
    }

    await ack(result.acked);
    await db.sales.where('id').anyOf(result.acked).modify({ sync: 'synced' });
  }

  /** Apply server-authoritative changes since our cursor. */
  async pull(): Promise<void> {
    const since = await getCursor();
    if (since === null) return; // not bootstrapped yet

    const changes = await api.pull(since);
    await this.applyPull(changes);
    await setCursor(changes.cursor);
  }

  // ── Local application ────────────────────────────────────────────────────

  private async applyBootstrap(snapshot: BootstrapResponse): Promise<void> {
    const products: Product[] = snapshot.products.map((p) => ({ ...p, is_active: true }));
    const tables: Table[] = snapshot.tables.map((t) => ({ ...t, is_active: true }));
    await db.transaction(
      'rw',
      db.categories,
      db.products,
      db.stock,
      db.staff,
      db.diningTables,
      async () => {
        await db.categories.clear();
        await db.categories.bulkPut(snapshot.categories);
        await db.products.clear();
        await db.products.bulkPut(products);
        await db.stock.clear();
        await db.stock.bulkPut(snapshot.stock);
        await db.staff.clear();
        await db.staff.bulkPut(snapshot.staff);
        await db.diningTables.clear();
        await db.diningTables.bulkPut(tables);
      },
    );
  }

  private async applyPull(changes: PullResponse): Promise<void> {
    await db.transaction(
      'rw',
      db.categories,
      db.products,
      db.stock,
      db.diningTables,
      db.staff,
      async () => {
        if (changes.categories.length) await db.categories.bulkPut(changes.categories);
        if (changes.products.length) await db.products.bulkPut(changes.products);
        if (changes.stock.length) await db.stock.bulkPut(changes.stock);
        if (changes.tables.length) await db.diningTables.bulkPut(changes.tables);

        if (changes.staff.length) {
          const removedIds = changes.staff.filter((s) => s.removed).map((s) => s.id);
          const live = changes.staff.filter((s) => !s.removed);
          if (removedIds.length) await db.staff.bulkDelete(removedIds);
          if (live.length) await db.staff.bulkPut(live);
        }
      },
    );
  }

  private handleError(error: unknown): void {
    if (error instanceof OfflineError) {
      this.emit({ online: false });
      return;
    }
    if (error instanceof ApiError && error.status === 401) {
      this.emit({ needsReauth: true });
    }
  }
}

function describe(error: unknown): string {
  if (error instanceof ApiError) return `api_${error.status}`;
  if (error instanceof Error) return error.name;
  return 'unknown';
}

export const syncManager = new SyncManager();
