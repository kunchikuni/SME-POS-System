/**
 * CSV import — port of ImportProductsController + Jobs/ImportProductsCsv.php.
 *
 * Runs synchronously in the request (no BullMQ wiring exists in this app
 * yet — see AUDIT.md). This matches the Laravel version's actual real-world
 * behavior more than its own code suggests: its own docblock documents that
 * QUEUE_CONNECTION=sync (a local-Windows workaround) meant it already ran
 * inline on the request in practice, which is exactly why its query-count
 * optimization mattered as much as it did. That optimization is preserved
 * here in full — see the docblock on doImport() below.
 *
 * Expected columns (header row, case-insensitive): sku, name, price,
 * barcode, category, initial_qty. Matches the template from
 * routes/importTemplate.ts and the *importable* subset of export.ts's
 * columns — export also writes brand/cost/tax_class/track_stock/
 * low_stock_threshold/on_hand, none of which the importer reads back. This
 * is not accidental scope-cutting on my part: it's the exact behavior of
 * the original Laravel job, preserved faithfully rather than expanded.
 */
import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { Prisma } from '../generated/prisma/client.js';
import { parseCsv } from '../lib/csv.js';
import type { HonoVars } from '../lib/context.js';

export const importRoutes = new Hono<{ Variables: HonoVars }>();

const ADMIN_ROLES = new Set(['owner', 'manager']);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB, matches the original's mimes:csv,txt|max:5120

importRoutes.post('/import', async (ctx) => {
  const user = ctx.get('user');
  if (!ADMIN_ROLES.has(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');

  const body = await ctx.req.parseBody();
  const file = body['file'];
  if (!(file instanceof File)) {
    return ctx.json({ message: 'No file uploaded.' }, 422);
  }
  if (file.size > MAX_BYTES) {
    return ctx.json({ message: 'File is too large — 5 MB maximum.' }, 422);
  }
  if (!/\.(csv|txt)$/i.test(file.name)) {
    return ctx.json({ message: 'File must be a .csv or .txt file.' }, 422);
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return ctx.json({ message: 'File is empty.' }, 422);
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const dataRows = rows.slice(1);

  const idx = (col: string) => header.indexOf(col);
  const skuIdx = idx('sku');
  const nameIdx = idx('name');
  if (skuIdx === -1 || nameIdx === -1) {
    return ctx.json({ message: 'CSV header must include at least "sku" and "name" columns.' }, 422);
  }
  const priceIdx = idx('price');
  const barcodeIdx = idx('barcode');
  const categoryIdx = idx('category');
  const qtyIdx = idx('initial_qty');

  const branchId = await defaultBranchId(tenant.id);
  if (!branchId) {
    return ctx.json({ message: 'No branch exists yet — create one before importing stock.' }, 422);
  }

  const result = await doImport(tenant.id, branchId, dataRows, {
    skuIdx, nameIdx, priceIdx, barcodeIdx, categoryIdx, qtyIdx,
  });

  return ctx.json({
    message: `Imported ${result.created} new and updated ${result.updated} existing product${result.created + result.updated === 1 ? '' : 's'}.` +
      (result.skipped > 0 ? ` Skipped ${result.skipped} row${result.skipped === 1 ? '' : 's'} missing sku/name.` : ''),
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
  });
});

async function defaultBranchId(tenantId: string): Promise<string | null> {
  const branch = await db.branch.findFirst({
    where: { tenantId, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  return branch?.id ?? null;
}

interface ColumnIndexes {
  skuIdx: number; nameIdx: number; priceIdx: number;
  barcodeIdx: number; categoryIdx: number; qtyIdx: number;
}

/**
 * Same batching strategy as the Laravel job, adapted to Prisma:
 *   1. Parse fully in memory first (already done by the caller) — no DB
 *      calls during parsing.
 *   2. Resolve categories once per UNIQUE name, not once per row.
 *   3. ONE query to find which SKUs already exist, so new-vs-update is
 *      known per row without a per-row existence check.
 *   4. ONE batched upsert for every product row — via raw SQL
 *      (INSERT ... ON CONFLICT), because Prisma has no bulk-upsert API and
 *      a loop of individual `db.product.upsert()` calls would silently
 *      reintroduce the exact per-row query cost this whole design avoids.
 *   5. Initial stock is still written PER new row, on purpose — each is a
 *      real, individual inventory event through the ledger (delta +
 *      StockMovement + StockLevel), same as every other stock change in
 *      this system. A typical import has hundreds of product rows but
 *      rarely hundreds of genuinely new SKUs with a nonzero initial_qty,
 *      so this was never the expensive part.
 *   Net query count for an N-row CSV: ~4 fixed queries + one INSERT per
 *   genuinely-new-with-stock row, versus 2-4 queries PER ROW beforehand.
 */
async function doImport(
  tenantId: string,
  branchId: string,
  dataRows: string[][],
  cols: ColumnIndexes,
) {
  type ParsedRow = { sku: string; name: string; priceCents: number; barcode: string | null; category: string | null; qty: number };

  const parsed: ParsedRow[] = [];
  let skipped = 0;

  for (const r of dataRows) {
    const sku = r[cols.skuIdx]?.trim();
    const name = r[cols.nameIdx]?.trim();
    if (!sku || !name) { skipped++; continue; }

    const priceRaw = cols.priceIdx !== -1 ? r[cols.priceIdx]?.trim() : '';
    const priceCents = Math.round((parseFloat(priceRaw || '0') || 0) * 100);

    const barcode = cols.barcodeIdx !== -1 ? (r[cols.barcodeIdx]?.trim() || null) : null;
    const category = cols.categoryIdx !== -1 ? (r[cols.categoryIdx]?.trim() || null) : null;
    const qtyRaw = cols.qtyIdx !== -1 ? r[cols.qtyIdx]?.trim() : '';
    const qty = parseInt(qtyRaw || '0', 10) || 0;

    parsed.push({ sku, name, priceCents, barcode, category, qty });
  }

  if (parsed.length === 0) {
    return { created: 0, updated: 0, skipped };
  }

  // Duplicate SKUs within the same file collapse to the LAST occurrence —
  // same behavior as the original's keyBy('sku'): each later row would
  // have re-updated the same one sequentially, so the last row's values
  // win either way. Order-preserving Map keeps this a single pass.
  const bySku = new Map<string, ParsedRow>();
  for (const row of parsed) bySku.set(row.sku, row);
  const uniqueRows = [...bySku.values()];

  // Categories: resolve once per unique name, not once per row.
  const categoryNames = [...new Set(uniqueRows.map((r) => r.category).filter((c): c is string => !!c))];
  const categoryIds = new Map<string, string>();
  if (categoryNames.length > 0) {
    const existing = await db.category.findMany({
      where: { tenantId, name: { in: categoryNames }, deletedAt: null },
      select: { id: true, name: true },
    });
    for (const c of existing) categoryIds.set(c.name, c.id);
    const missing = categoryNames.filter((n) => !categoryIds.has(n));
    // Rarely more than a couple dozen — looped creates are fine here,
    // matching the original's own reasoning for why this part wasn't
    // batched (see class docblock).
    for (const name of missing) {
      const created = await db.category.create({ data: { tenantId, name }, select: { id: true, name: true } });
      categoryIds.set(created.name, created.id);
    }
  }

  // One query: which SKUs already exist for this tenant.
  const skus = uniqueRows.map((r) => r.sku);
  const existing = await db.product.findMany({
    where: { tenantId, sku: { in: skus } },
    select: { id: true, sku: true },
  });
  const existingBySku = new Map(existing.map((p) => [p.sku, p.id]));

  const now = new Date();
  type UpsertRow = { id: string; sku: string; isNew: boolean; qty: number };
  const upserts: UpsertRow[] = [];

  const valueRows = uniqueRows.map((row) => {
    const existingId = existingBySku.get(row.sku);
    const id = existingId ?? crypto.randomUUID();
    upserts.push({ id, sku: row.sku, isNew: !existingId, qty: row.qty });

    const categoryId = row.category ? categoryIds.get(row.category) ?? null : null;

    return Prisma.sql`(${id}::uuid, ${tenantId}::uuid, ${row.sku}, ${row.name}, ${row.barcode}, ${categoryId}::uuid, ${row.priceCents}, 'retail', true, ${now}, ${now})`;
  });

  // ON CONFLICT target matches the @@unique([tenantId, sku]) constraint on
  // Product. 'id' is deliberately excluded from the update clause — an
  // existing product keeps its real id.
  await db.$executeRaw`
    INSERT INTO products (id, tenant_id, sku, name, barcode, category_id, price_cents, type, track_stock, created_at, updated_at)
    VALUES ${Prisma.join(valueRows)}
    ON CONFLICT (tenant_id, sku) DO UPDATE SET
      name = EXCLUDED.name,
      barcode = EXCLUDED.barcode,
      category_id = EXCLUDED.category_id,
      price_cents = EXCLUDED.price_cents,
      updated_at = EXCLUDED.updated_at
  `;

  // Initial stock — per new row on purpose (see function docblock). The id
  // used in the INSERT above is already the product's real id for new
  // rows, so no follow-up query is needed to find them (an improvement
  // over the original, which re-queried new products by SKU after the
  // upsert to get their ids).
  let created = 0;
  for (const row of upserts) {
    if (!row.isNew) continue;
    created++;
    if (row.qty > 0) {
      await db.$transaction([
        db.stockMovement.create({
          data: {
            id: crypto.randomUUID(),
            tenantId, branchId, productId: row.id,
            delta: row.qty, reason: 'initial',
            occurredAt: now, createdAt: now,
          },
        }),
        db.stockLevel.upsert({
          where: { branchId_productId: { branchId, productId: row.id } },
          create: { tenantId, branchId, productId: row.id, quantity: row.qty, updatedAt: now },
          update: { quantity: { increment: row.qty }, updatedAt: now },
        }),
      ]);
    }
  }

  return { created, updated: upserts.length - created, skipped };
}
