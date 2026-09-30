/** Analytics read models — port of AnalyticsController */
import { Hono } from 'hono';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
import { localOffsetMinutes } from '../lib/businessDay.js';
export const analyticsRoutes = new Hono<{ Variables: HonoVars }>();

analyticsRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant');
  const range = ctx.req.query('range') ?? '30';
  // ?range= is user input: a non-number (NaN) or a zero/negative would break the query.
  const days = Math.min(Math.max(parseInt(range) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const offset = localOffsetMinutes();

  // Raw SQL, so the result types are ours to fix: Postgres SUM()/COUNT() return
  // bigint, which Prisma hands back as a JS BigInt — and JSON can't serialise
  // one, so this endpoint 500'd on every call (Reports and the dashboard chart
  // never loaded). Cast to plain numbers in SQL (cents totals and counts are
  // far below 2^53), and return the day as "YYYY-MM-DD".
  const [salesByDay, topProducts, paymentMethods, branchPerformance] = await Promise.all([
    // Daily revenue — by the business's LOCAL day, like the Orders day view
    // (a 00:30 sale belongs to the new day, not the UTC day before).
    db.$queryRaw`
      SELECT to_char(occurred_at + (${offset}::int * interval '1 minute'), 'YYYY-MM-DD') AS date,
             SUM(total_cents)::float8 AS total_cents, COUNT(*)::int AS count
      FROM sales WHERE tenant_id = ${t.id} AND status = 'completed'
        AND occurred_at >= ${since} AND deleted_at IS NULL
      GROUP BY 1 ORDER BY 1 ASC
    `,
    // Top 10 products by revenue
    db.$queryRaw`
      SELECT sl.product_id, p.name, SUM(sl.line_total_cents)::float8 AS revenue, SUM(sl.qty)::int AS units_sold
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
