/**
 * The wire contract with App\Domain\Pos\SyncService. These types mirror the
 * server's JSON exactly — field names, nullability, and units — so a mismatch
 * is a compile error here, not a lost sale in the field.
 *
 * Money is always integer minor units (`*_cents`). Ids are client-generated
 * UUIDs on everything the till writes, which is what makes push idempotent and
 * offline records first-class (docs/ARCHITECTURE.md §6).
 */

export type ProductType = 'retail' | 'restaurant';

/** A tender label, recorded for the merchant's reporting. Wivae never processes it. */
export type PaymentMethod = 'cash' | 'ecocash' | 'innbucks' | 'omari' | 'onemoney' | 'zipit' | 'other';

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
  currency: string;
}

export interface SalePayload {
  id: string;
  cashier_id: string | null;
  /** Restaurant only: the table this order belongs to. */
  table_id: string | null;
  subtotal_cents: number;
  tax_cents: number;
  /** Restaurant only: tip added at settle. Part of total_cents. */
  gratuity_cents: number;
  total_cents: number;
  currency: string;
  /** ISO-8601; the real time the sale happened on the device, possibly offline. */
  occurred_at: string;
  lines: SaleLinePayload[];
  payments: PaymentPayload[];
}

// ── Mutations (the push envelope) ────────────────────────────────────────────

export type MutationType = 'sale.create';

export interface SaleCreateMutation {
  type: 'sale.create';
  sale: SalePayload;
}

export type Mutation = SaleCreateMutation;

// ── Endpoint payloads ────────────────────────────────────────────────────────

export interface BootstrapResponse {
  cursor: string;
  categories: Category[];
  products: Omit<Product, 'is_active'>[];
  stock: StockLevel[];
  staff: StaffMember[];
  tables: Omit<Table, 'is_active'>[];
}

export interface PullResponse {
  cursor: string;
  categories: Category[];
  products: Product[];
  stock: StockLevel[];
  tables: Table[];
  staff: StaffSyncEntry[];
}

export interface PushResponse {
  /** Ids the server has now durably applied — includes replays. */
  acked: string[];
  cursor: string;
}

export type TenantMode = 'retail' | 'restaurant';

export interface SessionResponse {
  device: { id: string; name: string };
  branch: { id: string; name: string };
  tenant: { name: string; theme: TenantTheme; mode: TenantMode; currency: string; taxRateBps: number };
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
