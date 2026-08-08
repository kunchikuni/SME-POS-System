/** Analytics read models — port of AnalyticsController */
import { Hono } from 'hono';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const analyticsRoutes = new Hono<{ Variables: HonoVars }>();

analyticsRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant');
  const range = ctx.req.query('range') ?? '30';
  const days = Math.min(parseInt(range), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [salesByDay, topProducts, paymentMethods, branchPerformance] = await Promise.all([
    // Daily revenue
    db.$queryRaw`
      SELECT DATE(occurred_at) as date, SUM(total_cents) as total_cents, COUNT(*) as count
      FROM sales WHERE tenant_id = ${t.id} AND status = 'completed'
        AND occurred_at >= ${since} AND deleted_at IS NULL
      GROUP BY DATE(occurred_at) ORDER BY date ASC
    `,
    // Top 10 products by revenue
    db.$queryRaw`
      SELECT sl.product_id, p.name, SUM(sl.line_total_cents) as revenue, SUM(sl.qty) as units_sold
      FROM sale_lines sl
      JOIN products p ON p.id = sl.product_id
      JOIN sales s ON s.id = sl.sale_id
      WHERE s.tenant_id = ${t.id} AND s.status = 'completed' AND s.occurred_at >= ${since} AND s.deleted_at IS NULL
      GROUP BY sl.product_id, p.name ORDER BY revenue DESC LIMIT 10
    `,
    // Payment method breakdown
    db.payment.groupBy({ by: ['method'], where: { tenantId: t.id, sale: { occurredAt: { gte: since }, status: 'completed', deletedAt: null } }, _sum: { amountCents: true }, _count: true }),
    // Branch performance
    db.sale.groupBy({ by: ['branchId'], where: { tenantId: t.id, status: 'completed', occurredAt: { gte: since }, deletedAt: null }, _sum: { totalCents: true }, _count: true }),
  ]);

  return ctx.json({ salesByDay, topProducts, paymentMethods, branchPerformance, range: days });
});
