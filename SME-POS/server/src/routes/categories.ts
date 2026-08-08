/** Categories routes — port of CategoryController */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const categoryRoutes = new Hono<{ Variables: HonoVars }>();
categoryRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant');
  const categories = await db.category.findMany({ where: { tenantId: t.id, deletedAt: null }, orderBy: { name: 'asc' } });
  return ctx.json({ categories });
});
categoryRoutes.post('/', async (ctx) => {
  const t = ctx.get('tenant');
  const { name } = z.object({ name: z.string().min(1) }).parse(await ctx.req.json());
  const cat = await db.category.create({ data: { id: crypto.randomUUID(), tenantId: t.id, name } });
  return ctx.json(cat, 201);
});
categoryRoutes.delete('/:id', async (ctx) => {
  const t = ctx.get('tenant');
  const cat = await db.category.findFirst({ where: { id: ctx.req.param('id'), tenantId: t.id } });
  if (!cat) return ctx.json({ message: 'Not found.' }, 404);
  await db.category.update({ where: { id: cat.id }, data: { deletedAt: new Date() } });
  return ctx.json({ message: 'Category removed.' });
});
