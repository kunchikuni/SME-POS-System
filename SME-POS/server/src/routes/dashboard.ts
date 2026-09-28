/** Dashboard overview — port of DashboardController */
import { Hono } from 'hono';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const dashboardRoutes = new Hono<{ Variables: HonoVars }>();

dashboardRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant');
  const today = new Date(); today.setHours(0,0,0,0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todaySales, monthSales, productCount, lowStockCount, openTasks] = await Promise.all([
    db.sale.aggregate({ where: { tenantId: t.id, status: 'completed', occurredAt: { gte: today }, deletedAt: null }, _sum: { totalCents: true }, _count: true }),
    db.sale.aggregate({ where: { tenantId: t.id, status: 'completed', occurredAt: { gte: monthStart }, deletedAt: null }, _sum: { totalCents: true }, _count: true }),
    db.product.count({ where: { tenantId: t.id, isActive: true, deletedAt: null } }),
    db.product.count({ where: { tenantId: t.id, trackStock: true, deletedAt: null, stockLevels: { some: { quantity: { lte: 0 }, branch: { deletedAt: null } } } } }), // live branches only — a removed branch's stock isn't "low"
    db.task.count({ where: { tenantId: t.id, status: 'open', deletedAt: null } }),
  ]);

  return ctx.json({
    today: { totalCents: todaySales._sum.totalCents ?? 0, count: todaySales._count },
    month: { totalCents: monthSales._sum.totalCents ?? 0, count: monthSales._count },
    products: productCount,
    lowStock: lowStockCount,
    openTasks,
  });
});
