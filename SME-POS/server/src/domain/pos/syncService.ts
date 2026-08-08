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
}

interface PushMutation {
  type: string;
  sale?: SalePayload;
}

// ── Service ───────────────────────────────────────────────────────────────────

/** Full snapshot for a newly provisioned device. */
export async function bootstrap(tenantId: string, branchId: string) {
  const [categories, products, stock, staff, tables] = await Promise.all([
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
  ]);

  return {
    cursor: new Date().toISOString(),
    categories,
    products,
    stock,
    staff: staff.map((u: typeof staff[number]) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      pin_hash: u.pinHash,
      removed: u.deletedAt !== null,
    })),
    tables,
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
    if (mutation.type !== 'sale.create' || !mutation.sale) {
      // Unknown mutation types are silently ignored (don't fail the batch)
      continue;
    }

    try {
      const id = await applySale(mutation.sale, tenantId, deviceId, branchId);
      if (id) acked.push(id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('sync.push: failed to apply sale', {
        saleId: mutation.sale?.id,
        error: err instanceof Error ? err.message : err,
      });
      // Not acked — stays in the till's outbox and retries on the next sync,
      // without blocking any other mutation in this batch.
    }
  }

  return { acked, cursor: new Date().toISOString() };
}

/** Incremental changes since the device's last cursor. */
export async function pull(tenantId: string, branchId: string, since: string) {
  const cursor = new Date(since);

  const [categories, products, stock, tables, rawStaff] = await Promise.all([
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
      },
    }),

    db.stockLevel.findMany({
      where: { tenantId, branchId, updatedAt: { gt: cursor } },
      select: { productId: true, quantity: true },
    }),

    db.restaurantTable.findMany({
      where: { tenantId, branchId, updatedAt: { gt: cursor } },
      select: { id: true, name: true, section: true, seats: true, isActive: true },
    }),

    // Include soft-deleted staff so the till can revoke deactivated cashiers
    db.user.findMany({
      where: { tenantId, pinHash: { not: null }, updatedAt: { gt: cursor } },
      select: { id: true, name: true, role: true, pinHash: true, deletedAt: true },
    }),
  ]);

  const staff = rawStaff.map((u: typeof rawStaff[number]) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    pin_hash: u.pinHash,
    removed: u.deletedAt !== null,
  }));

  return {
    cursor: new Date().toISOString(),
    categories,
    products,
    stock,
    tables,
    staff,
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
  // arithmetic must hold: line totals = qty × unit price, and the sale total
  // = Σlines + tax + gratuity. A payload that fails this is either a till
  // bug or tampering; both must be rejected loudly, not recorded as revenue.
  for (const line of data.lines ?? []) {
    if (line.qty < 1 || line.unit_price_cents < 0 ||
        line.line_total_cents !== line.qty * line.unit_price_cents) {
      throw new Error(`sale ${saleId}: line ${line.id} money math does not hold`);
    }
  }
  const linesSum = (data.lines ?? []).reduce((s, l) => s + l.line_total_cents, 0);
  if (data.subtotal_cents !== linesSum ||
      data.total_cents !== data.subtotal_cents + (data.tax_cents ?? 0) + (data.gratuity_cents ?? 0)) {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.$transaction as any)(async (tx: typeof db) => {
    // 1. Insert the sale
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
        // Idempotent movement insert (skip if movement_id already exists)
        const existingMovement = await tx.stockMovement.findUnique({
          where: { id: line.movement_id },
        });
        if (!existingMovement) {
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
  });

  return saleId;
}
