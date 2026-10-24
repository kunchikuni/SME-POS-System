/**
 * Downloadable CSV import template — port of ImportTemplateController.php.
 * Was entirely missing from the Node stack (no equivalent route existed at
 * all). Handing merchants a template with the exact expected header plus
 * one worked example removes the most common import failure: guessing
 * column names.
 *
 * Columns here match what routes/import.ts actually reads (sku, name,
 * price, barcode, category, initial_qty) — a subset of export.ts's fuller
 * column list, since the importer doesn't read back everything the
 * exporter writes (brand, cost, tax_class, track_stock, low_stock_threshold,
 * on_hand). See import.ts's docblock for why that's not accidental.
 */
import { Hono } from 'hono';
import { csvRow } from '../lib/csv.js';
import type { HonoVars } from '../lib/context.js';

export const importTemplateRoutes = new Hono<{ Variables: HonoVars }>();

const ADMIN_ROLES = new Set(['owner', 'manager']);
const COLUMNS = ['sku', 'name', 'price', 'barcode', 'category', 'initial_qty'];
const EXAMPLE = ['BEV-001', 'Coca-Cola 500ml', '1.50', '6001234567890', 'Beverages', '12'];

importTemplateRoutes.get('/import/template', async (ctx) => {
  const user = ctx.get('user');
  if (!ADMIN_ROLES.has(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const csv = [csvRow(COLUMNS), csvRow(EXAMPLE)].join('\r\n') + '\r\n';

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=UTF-8',
      'Content-Disposition': 'attachment; filename="wivae-product-import-template.csv"',
    },
  });
});
