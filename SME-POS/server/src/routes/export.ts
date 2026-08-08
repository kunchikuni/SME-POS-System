/**
 * CSV export — port of ProductExportController.php.
 *
 * Rewritten from the version that shipped earlier this session, which had
 * three real bugs found while reconciling it against the original:
 *   1. No permission check at all — any authenticated user, including a
 *      cashier, could export the full catalogue. The original explicitly
 *      gated this to admins; restored here.
 *   2. Column set didn't match the importer/template's expectations at
 *      all (different order, different columns), breaking the
 *      export-edit-reimport round trip the original was explicitly
 *      designed around (see its own docblock).
 *   3. Price/cost were dumped as raw integer cents instead of a
 *      human-editable dollar string, and fields weren't CSV-escaped —
 *      a product name containing a comma would have corrupted the file.
 */
import { Hono } from 'hono';
import { db } from '../lib/db.js';
import { csvRow } from '../lib/csv.js';
import type { HonoVars } from '../lib/context.js';

export const exportRoutes = new Hono<{ Variables: HonoVars }>();

const ADMIN_ROLES = new Set(['owner', 'manager']);
const COLUMNS = ['sku', 'barcode', 'name', 'brand', 'category', 'price', 'cost', 'tax_class', 'type', 'track_stock', 'low_stock_threshold', 'on_hand'];

const dollars = (cents: number) => (cents / 100).toFixed(2);

exportRoutes.get('/export', async (ctx) => {
  const user = ctx.get('user');
  if (!ADMIN_ROLES.has(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const t = ctx.get('tenant');
  const products = await db.product.findMany({
    where: { tenantId: t.id, deletedAt: null },
    include: { category: { select: { name: true } }, stockLevels: { select: { quantity: true } } },
    orderBy: { name: 'asc' },
  });

  const lines = [csvRow(COLUMNS)];
  for (const p of products) {
    const onHand = p.stockLevels.reduce((sum: number, sl: { quantity: number }) => sum + sl.quantity, 0);
    lines.push(csvRow([
      p.sku,
      p.barcode ?? '',
      p.name,
      p.brand ?? '',
      p.category?.name ?? '',
      dollars(p.priceCents),
      p.costCents !== null ? dollars(p.costCents) : '',
      p.taxClass,
      p.type,
      p.trackStock ? 'yes' : 'no',
      p.lowStockThreshold,
      onHand,
    ]));
  }

  const filename = `products-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=UTF-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});
