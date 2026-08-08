/** Kitchen display routes — port of KitchenController */
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const kitchenRoutes = new Hono<{ Variables: HonoVars }>();

kitchenRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant'); const u = ctx.get('user');
  const branchId = u.branchId ?? ctx.req.query('branchId');
  const orders = await db.kitchenOrder.findMany({
    where: { tenantId: t.id, status: { in: ['new','preparing'] }, deletedAt: null, ...(branchId ? { branchId } : {}) },
    include: { sale: { include: { lines: { include: { product: { select: { name: true } } } } } }, table: { select: { name: true } } },
    orderBy: { placedAt: 'asc' },
  });
  return ctx.json({ orders });
});

kitchenRoutes.patch('/:id', async (ctx) => {
  const t = ctx.get('tenant');
  const order = await db.kitchenOrder.findFirst({ where: { id: ctx.req.param('id'), tenantId: t.id, deletedAt: null } });
  if (!order) return ctx.json({ message: 'Not found.' }, 404);
  const { status } = z.object({ status: z.enum(['new','preparing','ready','served']) }).parse(await ctx.req.json());
  const updated = await db.kitchenOrder.update({ where: { id: order.id }, data: { status, ...(status === 'ready' ? { readyAt: new Date() } : {}) } });
  return ctx.json(updated);
});
