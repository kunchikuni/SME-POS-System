/** AI Insights — port of AiInsightsController (rule-based, not true AI) */
import { Hono } from 'hono';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const aiInsightsRoutes = new Hono<{ Variables: HonoVars }>();
aiInsightsRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // Dead stock: products with no sales in 30 days
  const deadStock = await db.$queryRaw`
    SELECT p.id, p.name, p.sku FROM products p
    WHERE p.tenant_id = ${t.id} AND p.is_active = true AND p.deleted_at IS NULL
    AND p.id NOT IN (
      SELECT DISTINCT sl.product_id FROM sale_lines sl
      JOIN sales s ON s.id = sl.sale_id
      WHERE s.tenant_id = ${t.id} AND s.occurred_at >= ${thirtyDaysAgo} AND s.deleted_at IS NULL
    ) LIMIT 20
  `;
  // Low margin products (cost > 60% of price)
  const lowMargin = await db.product.findMany({
    where: { tenantId: t.id, isActive: true, deletedAt: null, costCents: { not: null } },
    select: { id: true, name: true, sku: true, priceCents: true, costCents: true },
    take: 20,
  });
  const lowMarginFiltered = lowMargin.filter((p: typeof lowMargin[number]) => p.costCents && p.costCents / p.priceCents > 0.6);
  return ctx.json({ deadStock, lowMargin: lowMarginFiltered });
});
