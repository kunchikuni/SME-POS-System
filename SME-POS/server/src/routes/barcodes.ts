/**
 * Barcode labels — the data behind Products → Barcodes.
 *
 * The page draws each Code 128 label in the browser (JsBarcode) and prints
 * with window.print(), so the server only supplies what goes on a label. This
 * used to be a 501 stub ("PDF generation omitted"), so the Barcodes button
 * led to an empty, erroring page.
 *
 * A product without its own barcode is labelled with its SKU, so everything
 * is labellable.
 */
import { Hono } from 'hono';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const barcodeRoutes = new Hono<{ Variables: HonoVars }>();

barcodeRoutes.get('/barcodes', async (ctx) => {
  const t = ctx.get('tenant');
  const products = await db.product.findMany({
    where: { tenantId: t.id, deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, sku: true, barcode: true, priceCents: true },
  });
  return ctx.json({
    products: products.map((p: typeof products[number]) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      code: p.barcode?.trim() || p.sku,
      price: (p.priceCents / 100).toFixed(2),
    })),
  });
});
