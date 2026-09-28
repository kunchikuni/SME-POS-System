/**
 * The wire contract with server/src/domain/pos/syncService.ts. These types
 * mirror the server's JSON exactly — field names, nullability, and units —
 * so a mismatch is a compile error here, not a lost sale in the field.
 *
 * Money is always integer minor units (`*_cents`). Ids are client-generated
 * UUIDs on everything the till writes, which is what makes push idempotent and
 * offline records first-class (docs/ARCHITECTURE.md §6).
 */

export type ProductType = 'retail' | 'restaurant';

/**
 * A tender label, recorded for the merchant's reporting. Wivae never processes it.
 * 'credit' is the exception that moves no money: the amount is added to the
 * sale's customer's balance (see SalePayload.customer and applySale).
 */
export type PaymentMethod = 'cash' | 'ecocash' | 'innbucks' | 'omari' | 'onemoney' | 'zipit' | 'other' | 'credit';

/**
 * Someone who buys on credit. Tenant-wide, not per-branch: one customer can
 * owe across branches. `balance_cents` is what they owe (negative = in credit,
 * i.e. overpaid) — the server's figure on sync, bumped locally on this till
 * by credit sales and repayments until the next pull replaces it.
 */
export interface Customer {
    id: string;
    name: string;
    phone: string | null;
    balance_cents: number;
}

/** A customer change delivered via pull; `removed` means deleted in the dashboard. */
export interface CustomerSyncEntry extends Customer {
    removed: boolean;
}

/** Who a credit sale is owed by. May be brand new — the server upserts it by id. */
export interface SaleCustomer {
    id: string;
    name: string;
    phone: string | null;
}

// ── Catalog (server-authoritative, flows dashboard → till via pull) ──────────

export interface Category {
    id: string;
    name: string;
}

export interface Product {
    id: string;
    category_id: string | null;
    sku: string | null;
    barcode: string | null;
    name: string;
    price_cents: number;
    currency: string;
    tax_class: string;
    type: ProductType;
    track_stock: boolean;
    /** Present on pull; bootstrap only ships active products, so we default it true on ingest. */
    is_active: boolean;
}

/** Cached current stock for this device's branch: SUM(delta) from the ledger. */
export interface StockLevel {
    product_id: string;
    quantity: number;
}

/** Staff with a PIN, for offline shift login. PIN is attribution, not a security gate. */
export interface StaffMember {
    id: string;
    name: string;
    role: string;
    pin_hash: string;
}

/**
 * A staff change delivered via incremental pull: either an add/update (apply
 * normally) or a tombstone (`removed: true` — deactivated since the last
 * sync, delete the local record so their PIN stops working on this device).
 * Bootstrap never ships tombstones — it's a fresh snapshot of who's currently
 * active, so every entry there is implicitly a live StaffMember.
 */
export interface StaffSyncEntry extends StaffMember {
    removed: boolean;
}

// ── Sale snapshot (till → server; immutable once completed) ──────────────────

export interface SaleLinePayload {
    id: string;
    product_id: string | null;
    name: string;
    qty: number;
    unit_price_cents: number;
    line_total_cents: number;
    /** Client-minted stock ledger id, so the decrement is idempotent on replay. */
    movement_id?: string;
}

export interface PaymentPayload {
    id: string;
    method: PaymentMethod;
    amount_cents: number;
    /** What the customer actually handed over — only meaningfully set for
     * cash; other tender types are exact by nature. Null/undefined means
     * "not recorded" (older sales, or a non-cash payment), not "no change
     * owed" — Receipt.tsx and escpos.ts only show a change line when this is
     * genuinely present and exceeds amount_cents. */
    received_cents?: number | null;
    currency: string;
}

export interface SalePayload {
    id: string;
    cashier_id: string | null;
    /** The table this order belongs to, if any — independent of branch mode. */
    table_id: string | null;
    /**
     * Whether THIS sale should create a kitchen ticket. Not inferred from
     * table_id (a ticket can exist with no table — a "Counter" order) and not
     * inferred from the branch's mode — the gate is this flag, not a mode
     * check. Only RestaurantTill's checkout currently sets it (true by
     * default, with an explicit "skip kitchen" opt-out); RetailTill
     * deliberately never sends anything but false. This is what
     * SyncService::applySale() actually gates ticket creation on.
     */
    route_to_kitchen: boolean;
    subtotal_cents: number;
    tax_cents: number;
    /** Tip added at settle, when routed to the kitchen with gratuity offered. Part of total_cents. */
    gratuity_cents: number;
    total_cents: number;
    currency: string;
    /** ISO-8601; the real time the sale happened on the device, possibly offline. */
    occurred_at: string;
    lines: SaleLinePayload[];
    payments: PaymentPayload[];
    /** Required when any payment is 'credit' — the server rejects a credit sale without one. */
    customer?: SaleCustomer | null;
}

// ── Mutations (the push envelope) ────────────────────────────────────────────

export type MutationType = 'sale.create' | 'stock.receive' | 'debt.repay';

export interface SaleCreateMutation {
    type: 'sale.create';
    sale: SalePayload;
}

/**
 * Offline restocking — the till-side counterpart to the dashboard's
 * POST /products/:id/restock. Same underlying effect (a 'purchase' stock
 * movement, positive delta), but queued through the outbox so a delivery
 * can be received without a live connection, the same way a sale can be rung
 * up without one. `id` is the client-generated movement UUID and doubles as
 * the idempotency key, exactly like SaleLine.movement_id.
 */
export interface StockReceiveMutation {
    type: 'stock.receive';
    id: string;
    product_id: string;
    branch_id: string;
    qty: number;
    /** ISO-8601; when the delivery was actually received, possibly offline. */
    occurred_at: string;
}

/**
 * A customer paying off (some of) what they owe, recorded at the till —
 * offline-capable like a sale. `id` is the CustomerPayment ledger row's id and
 * the idempotency key. Lands in syncService.applyDebtRepayment.
 */
export interface DebtRepayMutation {
    type: 'debt.repay';
    id: string;
    customer_id: string;
    amount_cents: number;
    method: Exclude<PaymentMethod, 'credit'>;
    occurred_at: string;
}

export type Mutation = SaleCreateMutation | StockReceiveMutation | DebtRepayMutation;

// ── Endpoint payloads ────────────────────────────────────────────────────────

export interface BootstrapResponse {
    cursor: string;
    categories: Category[];
    products: Omit<Product, 'is_active'>[];
    stock: StockLevel[];
    staff: StaffMember[];
    tables: Omit<Table, 'is_active'>[];
    customers: Customer[];
}

export interface PullResponse {
    cursor: string;
    categories: Category[];
    products: Product[];
    stock: StockLevel[];
    tables: Table[];
    staff: StaffSyncEntry[];
    customers: CustomerSyncEntry[];
}

export interface PushResponse {
    /** Ids the server has now durably applied — includes replays. */
    acked: string[];
    cursor: string;
}

export type TenantMode = 'retail' | 'restaurant' | 'hardware' | 'workshop';

export interface SessionResponse {
    device: { id: string; name: string };
    /**
     * mode lives here, not on tenant — the authoritative source for what a
     * till at THIS branch opens to. Two branches of the same tenant can be
     * genuinely different business types; see Branch::mode server-side.
     */
    branch: { id: string; name: string; mode: TenantMode; address: string | null; phone: string | null };
    tenant: {
        name: string;
        theme: TenantTheme;
        currency: string;
        taxRateBps: number;
        /**
         * Only populated once a FiscalDevice exists AND is verified — an
         * unregistered or unverified device's TIN/VAT shouldn't be printed on a
         * receipt as if it were live. See Receipt.tsx for how "not configured"
         * vs "configured but not yet fiscalised" are shown differently.
         */
        fiscal: { verified: boolean; taxpayerTin: string | null; vatNumber: string | null };
    };
}

/** A restaurant floor-plan table. Only populated for restaurant tenants. */
export interface Table {
    id: string;
    name: string;
    section: string | null;
    seats: number;
    is_active: boolean;
}

/**
 * A till-visible task: read-only + completable from the till (Pos\TaskController).
 * Deliberately not part of the sync engine — fetched live, not stored in Dexie
 * (see docs note on Tasks scoping: a briefly-unreachable checklist isn't a
 * business risk the way a lost sale is).
 */
export interface TillTask {
    id: string;
    title: string;
    notes: string | null;
    due_at: string | null;
    assignee: string | null;
    assigned_to: string | null;
}

export interface TillTasksResponse {
    tasks: TillTask[];
}

export interface TenantTheme {
    [key: string]: unknown;
}
