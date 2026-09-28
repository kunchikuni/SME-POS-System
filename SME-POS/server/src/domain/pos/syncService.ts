/**
 * Sync Engine — port of SyncService.php
 *
 * Three operations, all keyed on client-generated UUIDs:
 *   bootstrap() — full snapshot for a fresh device
 *   push()      — apply a batch of local mutations idempotently
 *   pull()      — server-authoritative changes since the device's cursor
 *
 * Key invariants from ARCHITECTURE.md §5.1, §5.2, §6:
 *   - Stock is an append-only ledger: two offline tills selling the same
 *     item insert two -1 movements that sum correctly. No conflict.
 *   - Sales are immutable once written: idempotent on replay (skip if exists).
 *   - Cursor = ISO timestamp; pull returns everything updated after that.
 */
import { db } from '../../lib/db.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SaleLine {
    id: string;
    product_id?: string | null;
    name: string;
    qty: number;
    unit_price_cents: number;
    line_total_cents: number;
    movement_id?: string; // client-generated movement UUID for idempotency
}

interface SalePayment {
    id: string;
    method: string;
    amount_cents: number;
    received_cents?: number | null;
    currency?: string;
}

interface CustomerPayload {
    id: string;
    name: string;
    phone?: string | null;
}

interface SalePayload {
    id: string;
    cashier_id?: string | null;
    table_id?: string | null;
    route_to_kitchen?: boolean;
    status?: string;
    subtotal_cents: number;
    tax_cents?: number;
    gratuity_cents?: number;
    total_cents: number;
    currency?: string;
    occurred_at: string;
    lines: SaleLine[];
    payments?: SalePayment[];
    /** Set when any payment above has method: 'credit'. See applySale's handling below. */
    customer?: CustomerPayload | null;
}

interface PushMutation {
    type: string;
    sale?: SalePayload;
    // stock.receive fields — id doubles as the movement's idempotency key,
    // same convention as SaleLine.movement_id.
    id?: string;
    product_id?: string;
    branch_id?: string;
    qty?: number;
    occurred_at?: string;
    // debt.repay fields — id doubles as the idempotency key, same convention.
    customer_id?: string;
    amount_cents?: number;
    method?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

/** Full snapshot for a newly provisioned device. */
export async function bootstrap(tenantId: string, branchId: string) {
    const next = nextCursor(); // before the queries — see nextCursor()
    const [categories, products, stock, staff, tables, customers] = await Promise.all([
        db.category.findMany({
            where: { tenantId, deletedAt: null },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
        }),

        db.product.findMany({
            where: { tenantId, isActive: true, deletedAt: null },
            select: {
                id: true,
                categoryId: true,
                sku: true,
                barcode: true,
                name: true,
                priceCents: true,
                currency: true,
                taxClass: true,
                type: true,
                trackStock: true,
            },
        }),

        db.stockLevel.findMany({
            where: { tenantId, branchId },
            select: { productId: true, quantity: true },
        }),

        // PIN hashes let cashiers log into a shift offline (attribution only).
        // Include deleted staff as tombstones so the till can revoke them.
        db.user.findMany({
            where: { tenantId, pinHash: { not: null } },
            select: { id: true, name: true, role: true, pinHash: true, deletedAt: true },
        }),

        db.restaurantTable.findMany({
            where: { tenantId, branchId, isActive: true, deletedAt: null },
            orderBy: { sort: 'asc' },
            select: { id: true, name: true, section: true, seats: true },
        }),

        // Credit-sale debtor list — not branch-scoped (a customer's balance
        // is tenant-wide, the same customer can owe across branches), same
        // reasoning as staff. NOTE: requires `prisma generate` to have run
        // since Customer was added — see this project's README for that
        // known, currently-blocked step in the build sandbox this was
        // written in.
        db.customer.findMany({
            where: { tenantId, deletedAt: null },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, phone: true, balanceCents: true },
        }),
    ]);

    return {
        cursor: next,
        categories,
        products: products.map((p: typeof products[number]) => ({
            id: p.id,
            category_id: p.categoryId,
            sku: p.sku,
            barcode: p.barcode,
            name: p.name,
            price_cents: p.priceCents,
            currency: p.currency,
            tax_class: p.taxClass,
            type: p.type,
            track_stock: p.trackStock,
            is_active: true,
        })),
        stock: stock.map((s: typeof stock[number]) => ({
            product_id: s.productId,
            quantity: s.quantity,
        })),
        staff: staff.map((u: typeof staff[number]) => ({
            id: u.id,
            name: u.name,
            role: u.role,
            pin_hash: u.pinHash,
            removed: u.deletedAt !== null,
        })),
        tables: tables.map((t: typeof tables[number]) => ({
            id: t.id,
            name: t.name,
            section: t.section,
            seats: t.seats,
            is_active: true,
        })),
        customers: customers.map((c: typeof customers[number]) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            balance_cents: c.balanceCents,
        })),
    };
}

/**
 * Apply a batch of mutations. Returns acked ids (including prior replays).
 *
 * Failure isolation is per-mutation, not per-batch. Previously one malformed
 * sale threw out of the whole loop, which propagated to a bare 500 at the
 * route level: no partial ack list was ever returned, so every OTHER sale in
 * the same batch — even ones that applied cleanly — stayed unacked and got
 * retried. Not data loss (applySale's idempotency check saves a replay), but
 * if that one sale is durably malformed rather than transiently, the same
 * poison entry fails on every retry and wedges that till's sync indefinitely
 * — exactly the "queue wedge from one bad op" failure mode the original test
 * plan named. Now: a bad mutation is logged and simply left off the acked
 * list, so it alone gets retried while everything else in the batch clears.
 */
export async function push(
    mutations: PushMutation[],
    tenantId: string,
    deviceId: string,
    branchId: string,
): Promise<{ acked: string[]; cursor: string }> {
    const acked: string[] = [];

    for (const mutation of mutations) {
        try {
            if (mutation.type === 'sale.create' && mutation.sale) {
                const id = await applySale(mutation.sale, tenantId, deviceId, branchId);
                if (id) acked.push(id);
            } else if (
                mutation.type === 'stock.receive' &&
                mutation.id && mutation.product_id && mutation.branch_id &&
                typeof mutation.qty === 'number' && mutation.occurred_at
            ) {
                const id = await applyStockReceipt(
                    {
                        id: mutation.id,
                        product_id: mutation.product_id,
                        branch_id: mutation.branch_id,
                        qty: mutation.qty,
                        occurred_at: mutation.occurred_at,
                    },
                    tenantId,
                    branchId,
                );
                if (id) acked.push(id);
            } else if (
                mutation.type === 'debt.repay' &&
                mutation.id && mutation.customer_id &&
                typeof mutation.amount_cents === 'number' && mutation.amount_cents > 0 &&
                mutation.method && mutation.occurred_at
            ) {
                const id = await applyDebtRepayment(
                    {
                        id: mutation.id,
                        customer_id: mutation.customer_id,
                        amount_cents: mutation.amount_cents,
                        method: mutation.method,
                        occurred_at: mutation.occurred_at,
                    },
                    tenantId,
                    branchId,
                );
                if (id) acked.push(id);
            }
            // Unknown mutation types, or a known type missing required
            // fields, are silently ignored (don't fail the batch) — same
            // as the original behaviour for an unrecognised type.
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('sync.push: failed to apply mutation', {
                type: mutation.type,
                id: mutation.sale?.id ?? mutation.id,
                error: err instanceof Error ? err.message : err,
            });
            // Not acked — stays in the till's outbox and retries on the next
            // sync (with backoff — see pos/src/sync/outbox.ts), without
            // blocking any other mutation in this batch.
        }
    }

    return { acked, cursor: new Date().toISOString() };
}

/**
 * The cursor to hand back from a bootstrap/pull: taken BEFORE the queries
 * run, minus an overlap window.
 *
 * It used to be `new Date()` AFTER the queries. Pulls take seconds on the
 * hosted DB, and anything written during that window was newer than what
 * the queries saw but older than the returned cursor, so no later pull ever
 * fetched it — a stock receipt that synced while another till's pull was in
 * flight never reached that till.
 *
 * The overlap covers the other half of the race: `updatedAt` is stamped when
 * a write statement runs, but the row only becomes visible at COMMIT, which
 * for a receipt/sale transaction can be up to its 30s timeout later. Pull is
 * idempotent (every row is an absolute value, applied with bulkPut), so
 * re-sending the last minute of changes is harmless; missing one is not.
 */
const CURSOR_OVERLAP_MS = 60_000;
function nextCursor(): string {
    return new Date(Date.now() - CURSOR_OVERLAP_MS).toISOString();
}

/** Incremental changes since the device's last cursor. */
export async function pull(tenantId: string, branchId: string, since: string) {
    const cursor = new Date(since);
    const next = nextCursor(); // before the queries — see nextCursor()

    const [categories, products, stock, tables, rawStaff, rawCustomers] = await Promise.all([
        db.category.findMany({
            where: { tenantId, updatedAt: { gt: cursor } },
            select: { id: true, name: true },
        }),

        db.product.findMany({
            where: { tenantId, updatedAt: { gt: cursor } },
            select: {
                id: true,
                categoryId: true,
                sku: true,
                barcode: true,
                name: true,
                priceCents: true,
                currency: true,
                taxClass: true,
                type: true,
                trackStock: true,
                isActive: true,
                deletedAt: true,
            },
        }),

        // stock_levels.updated_at is NOT NULL now (schema + db), so the old
        // `updatedAt: null` fallback branch is gone — Prisma rejects null
        // filters on a required column, which 500'd every pull.
        db.stockLevel.findMany({
            where: { tenantId, branchId, updatedAt: { gt: cursor } },
            select: { productId: true, quantity: true },
        }),

        db.restaurantTable.findMany({
            where: { tenantId, branchId, updatedAt: { gt: cursor } },
            select: { id: true, name: true, section: true, seats: true, isActive: true, deletedAt: true },
        }),

        // Include soft-deleted staff so the till can revoke deactivated cashiers
        db.user.findMany({
            where: { tenantId, pinHash: { not: null }, updatedAt: { gt: cursor } },
            select: { id: true, name: true, role: true, pinHash: true, deletedAt: true },
        }),

        // Not branch-scoped — a customer's balance is tenant-wide (see
        // bootstrap's customer query for the same reasoning). NOTE: requires
        // prisma generate — see bootstrap's identical note above.
        // Includes deleted customers as tombstones (removed: true), same as staff.
        db.customer.findMany({
            where: { tenantId, updatedAt: { gt: cursor } },
            select: { id: true, name: true, phone: true, balanceCents: true, deletedAt: true },
        }),
    ]);

    const staff = rawStaff.map((u: typeof rawStaff[number]) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        pin_hash: u.pinHash,
        removed: u.deletedAt !== null,
    }));

    const customers = rawCustomers.map((c: typeof rawCustomers[number]) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        balance_cents: c.balanceCents,
        removed: c.deletedAt !== null,
    }));

    return {
        cursor: next,
        categories,
        products: products.map((p: typeof products[number]) => ({
            id: p.id,
            category_id: p.categoryId,
            sku: p.sku,
            barcode: p.barcode,
            name: p.name,
            price_cents: p.priceCents,
            currency: p.currency,
            tax_class: p.taxClass,
            type: p.type,
            track_stock: p.trackStock,
            is_active: p.isActive && p.deletedAt === null,
        })),
        stock: stock.map((s: typeof stock[number]) => ({
            product_id: s.productId,
            quantity: s.quantity,
        })),
        tables: tables.map((t: typeof tables[number]) => ({
            id: t.id,
            name: t.name,
            section: t.section,
            seats: t.seats,
            is_active: t.isActive && t.deletedAt === null,
        })),
        staff,
        customers,
    };
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Insert one sale, its lines, payments, and stock movements.
 * Idempotent: if the sale UUID already exists, skip and ack it.
 * Everything is one Prisma transaction — mid-flight failures leave nothing
 * partially applied.
 */
async function applySale(
    data: SalePayload,
    tenantId: string,
    deviceId: string,
    branchId: string,
): Promise<string> {
    const saleId = data.id;

    // Internal-consistency check on the money math before anything is written.
    // The client is the authority on WHAT was sold and at what captured price
    // (offline sales may predate a price change — that's by design), but the
    // arithmetic must hold.
    //
    // VAT-inclusive pricing note (ARCHITECTURE.md §3): price_cents is the gross
    // (customer-pays) price. line_total_cents = qty × unit_price_cents (gross).
    // subtotal_cents is the NET amount (ex-VAT), computed as linesSum - tax_cents.
    // So subtotal_cents + tax_cents = linesSum, NOT subtotal_cents = linesSum.
    // The original check (subtotal_cents === linesSum) was wrong for any non-zero
    // VAT rate — it would reject every sale from a tenant with VAT configured.
    for (const line of data.lines ?? []) {
        if (line.qty < 1 || line.unit_price_cents < 0 ||
            line.line_total_cents !== line.qty * line.unit_price_cents) {
            throw new Error(`sale ${saleId}: line ${line.id} money math does not hold`);
        }
    }
    // A credit tender with nobody to owe it would be recorded with the debt
    // attached to no one — money silently written off. The till refuses this
    // before saving (checkout.ts); this is the server-side guarantee.
    const hasCredit = (data.payments ?? []).some((p) => p.method === 'credit' && p.amount_cents > 0);
    if (hasCredit && !data.customer?.name?.trim()) {
        throw new Error(`sale ${saleId}: credit payment without a customer`);
    }

    const linesSum = (data.lines ?? []).reduce((s, l) => s + l.line_total_cents, 0);
    const gratuity = data.gratuity_cents ?? 0;
    if (data.total_cents !== linesSum + gratuity ||
        (data.subtotal_cents ?? 0) + (data.tax_cents ?? 0) !== linesSum) {
        throw new Error(`sale ${saleId}: totals do not reconcile with lines`);
    }

    // Idempotency check — prior replay; just ack it. Scoped to THIS tenant:
    // unscoped, a sale id existing in any other tenant would ack (and thus
    // permanently discard) this tenant's sale.
    const existing = await db.sale.findFirst({ where: { id: saleId, tenantId } });
    if (existing) return saleId;

    // Pre-fetch all products touched by this sale in one query — tenant-scoped,
    // so a crafted payload can't attach movements to another tenant's products.
    const productIds = (data.lines ?? [])
        .map((l) => l.product_id)
        .filter((id): id is string => Boolean(id));

    type ProductRow = { id: string; trackStock: boolean };
    const productsMap = new Map<string, ProductRow>(
        (
            await db.product.findMany({
                where: { id: { in: productIds }, tenantId },
                select: { id: true, trackStock: true },
            })
        ).map((p: ProductRow) => [p.id, p]),
    );

    // Pre-check which movement IDs already exist OUTSIDE the transaction —
    // doing this inside added one findUnique per line, which multiplied the
    // Supabase round-trip count and caused the 5s interactive transaction
    // timeout to fire on multi-line sales in environments with high TLS
    // handshake latency (antivirus interception etc.).
    const movementIds = (data.lines ?? [])
        .map((l) => l.movement_id)
        .filter((id): id is string => Boolean(id));
    const existingMovementIds = new Set(
        movementIds.length > 0
            ? (await db.stockMovement.findMany({
                where: { id: { in: movementIds } },
                select: { id: true },
            })).map((m: { id: string }) => m.id)
            : [],
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.$transaction as any)(async (tx: typeof db) => {
        // 1. Insert the sale — skip if already exists (idempotency within the
        // transaction, guarding against the race where the outer findFirst ran
        // before a concurrent apply committed the same sale).
        const alreadyExists = await tx.sale.findUnique({ where: { id: saleId }, select: { id: true } });
        if (alreadyExists) return; // already applied, nothing more to do

        await tx.sale.create({
            data: {
                id: saleId,
                tenantId,
                branchId,
                deviceId,
                cashierId: data.cashier_id ?? null,
                tableId: data.table_id ?? null,
                routeToKitchen: data.route_to_kitchen ?? false,
                status: 'completed',
                subtotalCents: data.subtotal_cents,
                taxCents: data.tax_cents ?? 0,
                gratuityCents: data.gratuity_cents ?? 0,
                totalCents: data.total_cents,
                currency: data.currency ?? 'USD',
                occurredAt: new Date(data.occurred_at),
                syncedAt: new Date(),
            },
        });

        // 2. Insert sale lines + stock movements
        for (const line of data.lines ?? []) {
            await tx.saleLine.create({
                data: {
                    id: line.id,
                    tenantId,
                    saleId,
                    productId: line.product_id ?? null,
                    name: line.name,
                    qty: line.qty,
                    unitPriceCents: line.unit_price_cents,
                    lineTotalCents: line.line_total_cents,
                },
            });

            // Append a stock movement and update the cached level
            const product = line.product_id ? (productsMap.get(line.product_id) as { id: string; trackStock: boolean } | undefined) : null;
            if (product?.trackStock && line.movement_id) {
                // Use the pre-fetched set — avoids a findUnique per line inside
                // the transaction (each round trip adds TLS latency on this machine).
                if (!existingMovementIds.has(line.movement_id)) {
                    await tx.stockMovement.create({
                        data: {
                            id: line.movement_id,
                            tenantId,
                            branchId,
                            productId: line.product_id!,
                            delta: -line.qty,
                            reason: 'sale',
                            ref: saleId,
                            occurredAt: new Date(data.occurred_at),
                            createdAt: new Date(),
                        },
                    });

                    // Upsert the cached stock level
                    await tx.stockLevel.upsert({
                        where: {
                            branchId_productId: { branchId, productId: line.product_id! },
                        },
                        create: {
                            tenantId,
                            branchId,
                            productId: line.product_id!,
                            quantity: -line.qty,
                            updatedAt: new Date(),
                        },
                        update: {
                            quantity: { decrement: line.qty },
                            updatedAt: new Date(),
                        },
                    });
                }
            }
        }

        // 3. Insert payments
        for (const payment of data.payments ?? []) {
            await tx.payment.create({
                data: {
                    id: payment.id,
                    tenantId,
                    saleId,
                    method: payment.method,
                    amountCents: payment.amount_cents,
                    receivedCents: payment.received_cents ?? null,
                    currency: payment.currency ?? 'USD',
                },
            });
        }

        // 3b. Credit sales — 'credit' is a tender type like cash/ecocash, not
        // a separate sale-level flag, so a sale can be part-cash/part-credit
        // (pay half now, owe half later) using the same payments array that
        // already supports split tender. The customer may be brand new —
        // created at the till in the same offline session as this sale, so
        // it's upserted here (by client-generated id) rather than required
        // to already exist, the same idempotency pattern StockMovement uses.
        const creditTotal = (data.payments ?? [])
            .filter((p) => p.method === 'credit')
            .reduce((sum, p) => sum + p.amount_cents, 0);

        if (creditTotal > 0 && data.customer) {
            await tx.customer.upsert({
                where: { id: data.customer.id },
                create: {
                    id: data.customer.id,
                    tenantId,
                    name: data.customer.name,
                    phone: data.customer.phone ?? null,
                    balanceCents: creditTotal,
                },
                update: {
                    balanceCents: { increment: creditTotal },
                    // A returning customer's name/phone may have been edited
                    // at the till since their last sale — keep it current
                    // rather than freeze it at first-ever credit sale.
                    name: data.customer.name,
                    phone: data.customer.phone ?? null,
                },
            });

            await tx.sale.update({
                where: { id: saleId },
                data: { customerId: data.customer.id },
            });
        }

        // 4. Create kitchen ticket if the sale requested it
        if (data.route_to_kitchen === true) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const maxTicket = await tx.kitchenOrder.aggregate({
                where: { branchId, placedAt: { gte: today } },
                _max: { ticketNo: true },
            });

            await tx.kitchenOrder.create({
                data: {
                    tenantId,
                    branchId,
                    saleId,
                    tableId: data.table_id ?? null,
                    ticketNo: (maxTicket._max.ticketNo ?? 0) + 1,
                    status: 'new',
                    placedAt: new Date(data.occurred_at),
                },
            });
        }
    }, { timeout: 30_000 }); // 30s — antivirus TLS interception adds ~300-500ms per query

    return saleId;
}

interface StockReceiptData {
    id: string;
    product_id: string;
    branch_id: string;
    qty: number;
    occurred_at: string;
}

interface DebtRepaymentData {
    id: string;
    customer_id: string;
    amount_cents: number;
    method: string;
    occurred_at: string;
}

/**
 * A repayment against a customer's credit balance. Same shape of guarantees
 * as applyStockReceipt: idempotent on replay (id doubles as the ledger row's
 * primary key), tenant-scoped existence check on the customer before the
 * transaction, and a real transaction writing both the CustomerPayment
 * ledger row and the Customer.balanceCents cache atomically — the same
 * ledger-plus-cache pattern as StockMovement/StockLevel, not a bare
 * decrement with no audit trail.
 *
 * Deliberately does NOT clamp the resulting balance at zero. A negative
 * balanceCents means the customer overpaid (or paid before every pending
 * credit sale finished syncing from a different till) — that's real
 * information an owner should see, not something to silently discard.
 */
async function applyDebtRepayment(
    data: DebtRepaymentData,
    tenantId: string,
    branchId: string,
): Promise<string> {
    if (!Number.isInteger(data.amount_cents) || data.amount_cents < 1) {
        throw new Error(`debt repayment ${data.id}: amount_cents must be a positive integer`);
    }

    // Idempotency check — prior replay; just ack it. Same reasoning as
    // applyStockReceipt: scoped to THIS tenant, or a payment id existing in
    // any other tenant would ack (and thus permanently discard) this one.
    const existing = await db.customerPayment.findFirst({ where: { id: data.id, tenantId } });
    if (existing) return data.id;

    // Tenant-scoped existence check outside the transaction — same
    // reasoning as applyStockReceipt's pre-fetch (one round trip here
    // rather than one inside the transaction).
    const customer = await db.customer.findFirst({
        where: { id: data.customer_id, tenantId, deletedAt: null },
        select: { id: true },
    });
    if (!customer) throw new Error(`debt repayment ${data.id}: customer ${data.customer_id} not found for tenant`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.$transaction as any)(async (tx: typeof db) => {
        const alreadyExists = await tx.customerPayment.findUnique({ where: { id: data.id }, select: { id: true } });
        if (alreadyExists) return; // already applied — same race guard as applyStockReceipt

        await tx.customerPayment.create({
            data: {
                id: data.id,
                tenantId,
                customerId: data.customer_id,
                branchId,
                amountCents: data.amount_cents,
                method: data.method,
                occurredAt: new Date(data.occurred_at),
            },
        });

        await tx.customer.update({
            where: { id: data.customer_id },
            data: {
                balanceCents: { decrement: data.amount_cents },
                updatedAt: new Date(),
            },
        });
    }, { timeout: 30_000 });

    return data.id;
}

/**
 * The offline-restock counterpart to applySale — same shape of guarantees,
 * much smaller surface. A delivery received on the till while offline
 * queues through the same outbox a sale does, and lands here on sync.
 *
 * `id` is the client-generated movement UUID and IS the idempotency key —
 * there's no separate "sale" wrapper the way a stock movement from a sale
 * has one (SaleLine.movement_id references a sale that owns it); a restock
 * movement stands alone, so its own id has to carry that job directly.
 */
async function applyStockReceipt(
    received: StockReceiptData,
    tenantId: string,
    deviceBranchId: string,
): Promise<string> {
    // The device's branch is authoritative, exactly as for sales (applySale
    // writes its movements to the device's branchId, never a payload field).
    // Previously the client-sent branch_id was trusted, so a till could book
    // a delivery into ANY branch of the tenant — while that same till's sales
    // decremented its own branch — splitting one branch's stock across two.
    if (received.branch_id !== deviceBranchId) {
        // eslint-disable-next-line no-console
        console.warn('sync.push: stock.receive branch_id differs from device branch; using device branch', {
            id: received.id,
            payloadBranch: received.branch_id,
            deviceBranch: deviceBranchId,
        });
    }
    const data: StockReceiptData = { ...received, branch_id: deviceBranchId };

    if (!Number.isInteger(data.qty) || data.qty < 1) {
        throw new Error(`stock receipt ${data.id}: qty must be a positive integer`);
    }

    // Idempotency check — prior replay; just ack it. Scoped to THIS tenant,
    // same reasoning as applySale: unscoped, a movement id existing in any
    // other tenant would ack (and thus permanently discard) this tenant's
    // receipt.
    const existing = await db.stockMovement.findFirst({ where: { id: data.id, tenantId } });
    if (existing) return data.id;

    // Tenant-scoped existence + trackStock check, done outside the
    // transaction — same reasoning as applySale's pre-fetch: one round trip
    // here rather than one inside the transaction, which is what caused the
    // 5s interactive-transaction timeout on multi-line sales in
    // high-latency environments (see the comment on applySale above).
    const [product, branch] = await Promise.all([
        db.product.findFirst({
            where: { id: data.product_id, tenantId, deletedAt: null },
            select: { id: true, trackStock: true },
        }),
        db.branch.findFirst({ where: { id: data.branch_id, tenantId, deletedAt: null }, select: { id: true } }),
    ]);
    if (!product) throw new Error(`stock receipt ${data.id}: product ${data.product_id} not found for tenant`);
    if (!branch) throw new Error(`stock receipt ${data.id}: branch ${data.branch_id} not found for tenant`);
    if (!product.trackStock) throw new Error(`stock receipt ${data.id}: product does not track stock`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.$transaction as any)(async (tx: typeof db) => {
        const alreadyExists = await tx.stockMovement.findUnique({ where: { id: data.id }, select: { id: true } });
        if (alreadyExists) return; // already applied — same race guard as applySale

        await tx.stockMovement.create({
            data: {
                id: data.id,
                tenantId,
                branchId: data.branch_id,
                productId: data.product_id,
                delta: data.qty, // positive — a receipt adds stock, a sale (delta: -qty) removes it
                reason: 'purchase', // same reason string the dashboard's manual restock endpoint uses
                occurredAt: new Date(data.occurred_at),
                createdAt: new Date(),
            },
        });

        await tx.stockLevel.upsert({
            where: {
                branchId_productId: { branchId: data.branch_id, productId: data.product_id },
            },
            create: {
                tenantId,
                branchId: data.branch_id,
                productId: data.product_id,
                quantity: data.qty,
                updatedAt: new Date(),
            },
            update: {
                quantity: { increment: data.qty },
                updatedAt: new Date(),
            },
        });
    }, { timeout: 30_000 });

    return data.id;
}
