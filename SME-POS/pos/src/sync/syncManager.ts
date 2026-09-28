import { api, ApiError, OfflineError } from './apiClient';
import { ack, markAttempt, pendingCount, pendingRetryable, pendingStuck, resetBackoff } from './outbox';
import { mergeSessionInfo } from './session';
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
 *
 * Hardening notes (see docs/ARCHITECTURE.md §6 + implementation_plan.md):
 *   - flush() now uses pendingRetryable() with exponential backoff — entries
 *     that have failed 5+ times are skipped until their backoff window passes,
 *     preventing endless hammering of a broken endpoint on every 30s poll.
 *   - The cursor returned by push is applied BEFORE pull, saving the round-trip
 *     of re-fetching data the server already told us about.
 *   - bootstrap() is fully atomic: both the catalog write and the cursor set
 *     happen inside a single Dexie transaction. A crash between them previously
 *     left the DB with data but no cursor, triggering a redundant re-bootstrap.
 *   - outboxStuck flag is emitted when any entry has attempted >= 5 times,
 *     surfacing an OutboxStuckBanner in the UI (Shared.tsx).
 *   - lastSyncBatch is emitted whenever a flush actually acks something,
 *     carrying a count + timestamp so the UI can show a brief "N sales
 *     synced" confirmation toast without needing its own separate polling —
 *     deliberately auto-dismissing rather than persistent, unlike the stuck
 *     banner, since this is reassurance rather than something needing action.
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
    /**
     * true when one or more outbox entries have failed >= 5 delivery attempts
     * and are now gated behind exponential backoff. The UI surfaces an
     * OutboxStuckBanner prompting the operator to contact support, since this
     * level of failure suggests a persistent server-side or shape mismatch
     * problem that won't self-heal.
     */
    outboxStuck: boolean;
    /**
     * The most recent successful flush that actually acked something — null
     * until the first one. Carries a timestamp, not just a count, so a
     * subscribing component can tell "a new batch just synced" apart from
     * "the same old batch, re-rendered" (a plain count would look identical
     * across two unrelated renders if the same number of sales happened to
     * sync twice in a row). The UI surfaces this as a brief, auto-dismissing
     * confirmation toast — deliberately not persistent like OutboxStuckBanner,
     * since "N sales synced" is reassurance, not something needing action.
     */
    lastSyncBatch: { count: number; at: string } | null;
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
        outboxStuck: false,
        lastSyncBatch: null,
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
        const [count, stuck] = await Promise.all([pendingCount(), pendingStuck()]);
        this.emit({ pending: count, outboxStuck: stuck.length > 0 });
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

    /**
     * Full snapshot for a freshly provisioned device. Replaces local catalog.
     *
     * Atomic: both the catalog write and the cursor set are inside a single
     * Dexie transaction. Previously they were two separate awaits — a crash
     * between them left the DB populated but with no cursor, causing a redundant
     * re-bootstrap on the next boot (clearing and re-populating the catalog
     * unnecessarily, wasting the user's first sync round-trip).
     */
    async bootstrap(): Promise<void> {
        const snapshot = await api.bootstrap();

        await db.transaction(
            'rw',
            [db.categories, db.products, db.stock, db.staff, db.diningTables, db.meta],
            async () => {
                await this.applyBootstrap(snapshot);
                await setCursor(snapshot.cursor);
            },
        );

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

    /** Clear backoff on every queued entry and sync straight away. */
    async retryNow(): Promise<void> {
        await resetBackoff();
        await this.refreshPending();
        await this.sync();
    }

    /**
     * Refreshes the stored branch mode + tenant currency/tax-rate/theme from
     * the server on every sync cycle — see session.ts for why this exists.
     * Failure here (offline, etc.) is swallowed on purpose: it must never
     * abort flush/pull, which are the operations that actually matter for not
     * losing a sale.
     */
    private async refreshTenantInfo(): Promise<void> {
        try {
            const { tenant, branch } = await api.session();
            if (mergeSessionInfo(tenant, branch)) {
                this.emit({ settingsChanged: true });
            }
        } catch {
            // Non-fatal: catalog/stock/sales sync already succeeded above.
        }
    }

    /**
     * Drain the outbox. Only retryable entries (not in backoff) are sent.
     * Acked ids are removed and their local sale marked synced.
     *
     * Cursor advancement: the server returns the cursor state AFTER applying
     * the mutations. We advance the local cursor to that value before pull(),
     * saving the unnecessary re-fetch of data the server already told us about.
     */
    async flush(): Promise<void> {
        const entries = await pendingRetryable();
        if (entries.length === 0) return;

        const mutations = entries.map((e) => e.payload);

        let result;
        try {
            result = await api.push(mutations);
        } catch (error) {
            if (error instanceof OfflineError) return; // retry later, nothing wrong
            // A whole-request failure only counts against the entries when the
            // request itself was rejected (4xx other than auth). A 5xx — server
            // down, DB unreachable, or the dev Vite proxy answering 500 because
            // :3000 isn't running — or a 401/403 says nothing about any single
            // sale; counting those used to push every queued sale past the
            // stuck threshold after ~5 minutes of backend downtime.
            if (isEntryAttributable(error)) {
                for (const entry of entries) {
                    await markAttempt(entry.mutationId, describe(error));
                }
            }
            throw error;
        }

        // The server isolates failures per mutation (syncService.push) and
        // simply leaves a rejected one off the acked list with a 200. Count
        // that against the entry, otherwise a poison sale retries every poll
        // forever without ever backing off or surfacing as stuck.
        const ackedSet = new Set(result.acked);
        for (const entry of entries) {
            if (!ackedSet.has(entry.mutationId)) {
                await markAttempt(entry.mutationId, 'rejected_by_server');
            }
        }

        await ack(result.acked);
        await db.sales.where('id').anyOf(result.acked).modify({ sync: 'synced' });

        if (result.acked.length > 0) {
            this.emit({ lastSyncBatch: { count: result.acked.length, at: new Date().toISOString() } });
        }

        // Advance cursor from push result — avoids re-pulling data we just sent.
        if (result.cursor) {
            await setCursor(result.cursor);
        }
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
        // NB: called within bootstrap()'s outer transaction — no nested transaction needed.
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

function isEntryAttributable(error: unknown): boolean {
    if (!(error instanceof ApiError)) return true;
    if (error.status < 400 || error.status >= 500) return false;
    return ![401, 403, 408, 429].includes(error.status);
}

function describe(error: unknown): string {
    if (error instanceof ApiError) return `api_${error.status}`;
    if (error instanceof Error) return error.name;
    return 'unknown';
}

export const syncManager = new SyncManager();
