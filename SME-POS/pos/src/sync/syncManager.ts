import { api, ApiError, OfflineError } from './apiClient';
import { ACTIVE_SUBSCRIPTION, loadSubscription, saveSubscription, type SubscriptionState } from './subscription';
import { ack, markAttempt, pendingCount, pendingRetryable, pendingStuck, resetBackoff } from './outbox';
import { mergeSessionInfo } from './session';
import { db, getCursor, setCursor, type OutboxEntry } from '../db/database';
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
 *   - Only pull moves the cursor. Push used to jump it to the push's end
 *     time, which skipped the push's own stock changes (a received delivery)
 *     and anything other tills changed in between.
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
    /**
     * Where the business stands on payment. 'lapsed' means the server has paused
     * sync (402): sales are still rung up and kept on this device, and nothing is
     * counted as failed. See subscription.ts and the SubscriptionBanner (Shared.tsx).
     */
    subscription: SubscriptionState;
}

type Listener = (status: SyncStatus) => void;

/**
 * Set once a till has done the one-time full re-pull (see pull()). V2: tills
 * that already caught up under V1 did so before they had a customers table,
 * and existing customers only reach a till via a pull that includes them —
 * so everyone re-pulls once more to fill it.
 */
const CURSOR_CATCH_UP_KEY = 'cursorCatchUpV2';

/** While sync is paused for payment, look again this often (or straight away on "Retry"). */
const LAPSED_RECHECK_MS = 5 * 60_000;

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
        subscription: loadSubscription(),
    };

    /** Earliest time an automatic sync may try again while paused for payment. */
    private lapsedRetryAt = 0;

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

    /** Record where the business stands on payment (and remember it across reloads). */
    setSubscription(next: SubscriptionState): void {
        const current = this.status.subscription;
        if (current.state === next.state && current.graceEndsAt === next.graceEndsAt) return;
        saveSubscription(next);
        this.emit({ subscription: next });
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
            [db.categories, db.products, db.stock, db.staff, db.diningTables, db.customers, db.meta],
            async () => {
                await this.applyBootstrap(snapshot);
                await setCursor(snapshot.cursor);
                // A fresh snapshot has nothing to catch up on (see pull()).
                await db.meta.put({ key: CURSOR_CATCH_UP_KEY, value: true });
            },
        );

        this.emit({ lastSyncedAt: new Date().toISOString() });
    }

    /**
     * Push then pull. Push first so the server has our sales before we ask what
     * changed; both steps tolerate being offline and simply defer.
     */
    async sync(force = false): Promise<void> {
        if (this.status.syncing) return;
        // Paused for payment: don't hit the server on every 30s poll — look again every
        // few minutes, or straight away when the cashier taps Retry (force).
        if (!force && this.status.subscription.state === 'lapsed' && Date.now() < this.lapsedRetryAt) return;
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
        await this.sync(true);
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
            const { tenant, branch, subscription } = await api.session();
            // A sync that got this far means payment isn't blocking it; the server says which side of the grace period we're on.
            this.setSubscription(subscription ?? ACTIVE_SUBSCRIPTION);
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
     * Does not touch the cursor — see the note at the end of this method.
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

        // Deliberately NOT advancing the cursor from result.cursor. Doing so
        // skipped (a) the stock level our own push just changed — a received
        // delivery never showed on the till that received it — and (b) any
        // change another till or the dashboard made between our last pull and
        // this push. Only pull() moves the cursor, from what it actually read.
    }

    /** Apply server-authoritative changes since our cursor. */
    async pull(): Promise<void> {
        const cursor = await getCursor();
        if (cursor === null) return; // not bootstrapped yet

        // One-time catch-up for tills that ran with the old cursor bugs (push
        // jumping the cursor forward; the server stamping it after its
        // queries): changes they skipped sit BEFORE their saved cursor, so an
        // ordinary pull would never return them. Pulling once from the epoch
        // re-sends every row as an absolute value — idempotent — then the
        // marker stops it happening again.
        const caughtUp = (await db.meta.get(CURSOR_CATCH_UP_KEY))?.value === true;
        const since = caughtUp ? cursor : new Date(0).toISOString();

        const changes = await api.pull(since);
        await this.applyPull(changes);
        await setCursor(changes.cursor);
        if (!caughtUp) await db.meta.put({ key: CURSOR_CATCH_UP_KEY, value: true });
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
        await db.customers.clear();
        await db.customers.bulkPut(snapshot.customers ?? []);
    }

    private async applyPull(changes: PullResponse): Promise<void> {
        await db.transaction(
            'rw',
            [db.categories, db.products, db.stock, db.diningTables, db.staff, db.customers, db.outbox],
            async () => {
                // Server figures are authoritative for everything the server has
                // APPLIED — but not for this till's still-queued mutations (a sale
                // rung up while this sync was in flight, or one whose push failed
                // during an outage). Writing the bare server level used to erase
                // their local decrement, so the till showed those units as back
                // in stock and let them be sold again: an oversell that surfaced
                // as negative stock on the dashboard. Re-apply what's pending on
                // top, in the same transaction the outbox is read in.
                const pending = pendingEffects(await db.outbox.toArray());

                if (changes.categories.length) await db.categories.bulkPut(changes.categories);
                if (changes.products.length) await db.products.bulkPut(changes.products);
                if (changes.stock.length) {
                    await db.stock.bulkPut(changes.stock.map((s) => ({
                        ...s,
                        quantity: s.quantity + (pending.stock.get(s.product_id) ?? 0),
                    })));
                }
                if (changes.tables.length) await db.diningTables.bulkPut(changes.tables);

                if (changes.staff.length) {
                    const removedIds = changes.staff.filter((s) => s.removed).map((s) => s.id);
                    const live = changes.staff.filter((s) => !s.removed);
                    if (removedIds.length) await db.staff.bulkDelete(removedIds);
                    if (live.length) await db.staff.bulkPut(live);
                }

                // Same tombstone handling as staff. The server's balance is
                // authoritative and replaces this till's optimistic one — it
                // already includes our credit sales/repayments once acked
                // (flush runs before pull).
                const customers = changes.customers ?? [];
                if (customers.length) {
                    const removedIds = customers.filter((c) => c.removed).map((c) => c.id);
                    const live = customers
                        .filter((c) => !c.removed)
                        .map(({ id, name, phone, balance_cents }) => ({
                            id, name, phone,
                            balance_cents: balance_cents + (pending.balance.get(id) ?? 0),
                        }));
                    if (removedIds.length) await db.customers.bulkDelete(removedIds);
                    if (live.length) await db.customers.bulkPut(live);
                }
            },
        );
    }

    private handleError(error: unknown): void {
        if (error instanceof OfflineError) {
            this.emit({ online: false });
            return;
        }
        if (error instanceof ApiError && error.status === 402) {
            // Paused for payment. Nothing is wrong with the sales: they stay queued on
            // this device and go out once the business renews.
            this.lapsedRetryAt = Date.now() + LAPSED_RECHECK_MS;
            this.setSubscription({ state: 'lapsed', graceEndsAt: this.status.subscription.graceEndsAt });
            return;
        }
        if (error instanceof ApiError && error.status === 401) {
            this.emit({ needsReauth: true });
        }
    }
}

/**
 * What this till's not-yet-acknowledged mutations do to stock levels and
 * customer balances, relative to the server's figures — the local
 * optimistic effects (checkout.ts, ReceiveStock, RecordPayment) that a pull
 * must preserve until the server has applied them.
 */
export function pendingEffects(entries: OutboxEntry[]): {
    stock: Map<string, number>;
    balance: Map<string, number>;
} {
    const stock = new Map<string, number>();
    const balance = new Map<string, number>();
    const add = (m: Map<string, number>, key: string, delta: number) => m.set(key, (m.get(key) ?? 0) + delta);

    for (const { payload } of entries) {
        if (payload.type === 'sale.create') {
            for (const line of payload.sale.lines) {
                // Only tracked lines carry a movement_id (see buildSaleMutation).
                if (line.product_id && line.movement_id) add(stock, line.product_id, -line.qty);
            }
            const credit = payload.sale.payments
                .filter((p) => p.method === 'credit')
                .reduce((sum, p) => sum + p.amount_cents, 0);
            if (credit > 0 && payload.sale.customer) add(balance, payload.sale.customer.id, credit);
        } else if (payload.type === 'stock.receive') {
            add(stock, payload.product_id, payload.qty);
        } else if (payload.type === 'debt.repay') {
            add(balance, payload.customer_id, -payload.amount_cents);
        }
    }
    return { stock, balance };
}

function isEntryAttributable(error: unknown): boolean {
    if (!(error instanceof ApiError)) return true;
    if (error.status < 400 || error.status >= 500) return false;
    // 402 = the business hasn't paid: says nothing about any single sale, exactly like an auth error.
    return ![401, 402, 403, 408, 429].includes(error.status);
}

function describe(error: unknown): string {
    if (error instanceof ApiError) return `api_${error.status}`;
    if (error instanceof Error) return error.name;
    return 'unknown';
}

export const syncManager = new SyncManager();
