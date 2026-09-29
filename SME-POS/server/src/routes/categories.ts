/** Categories routes — port of CategoryController */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
import { businessTypeFor } from '../domain/businessTypes.js';
export const categoryRoutes = new Hono<{ Variables: HonoVars }>();
categoryRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant');
  const rows = await db.category.findMany({
    where: { tenantId: t.id, deletedAt: null },
    orderBy: { name: 'asc' },
    // The page shows "N products" per category — it was never sent, so it read as blank.
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
  });
  const categories = rows.map(({ _count, ...c }: typeof rows[number]) => ({ ...c, products_count: _count.products }));
  return ctx.json({ categories });
});
categoryRoutes.post('/', async (ctx) => {
  const t = ctx.get('tenant');
  const { name } = z.object({ name: z.string().min(1) }).parse(await ctx.req.json());
  const cat = await db.category.create({ data: { id: crypto.randomUUID(), tenantId: t.id, name } });
  return ctx.json(cat, 201);
});
/**
 * Ready-made categories for this kind of business (domain/businessTypes.ts)
 * that the business doesn't have yet. New businesses get them at sign-up;
 * this lets existing ones — or anyone who deleted some — add them later.
 * Compared by name ignoring case, so "groceries" counts as "Groceries".
 */
async function missingSuggestions(tenant: { id: string; mode: string | null }) {
  const [existing, branch] = await Promise.all([
    db.category.findMany({ where: { tenantId: tenant.id, deletedAt: null }, select: { name: true } }),
    db.branch.findFirst({
      where: { tenantId: tenant.id, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { mode: true },
    }),
  ]);
  const type = businessTypeFor(tenant.mode, branch?.mode);
  const have = new Set(existing.map((c: { name: string }) => c.name.trim().toLowerCase()));
  return { type, missing: type.categories.filter((n) => !have.has(n.toLowerCase())) };
}

// GET /categories/suggestions
categoryRoutes.get('/suggestions', async (ctx) => {
  const { type, missing } = await missingSuggestions(ctx.get('tenant'));
  return ctx.json({ businessType: type.label, suggestions: missing });
});

// POST /categories/suggestions { names?: string[] } — add some (or all) of them
categoryRoutes.post('/suggestions', async (ctx) => {
  const t = ctx.get('tenant');
  const { names } = z.object({ names: z.array(z.string()).optional() }).parse(await ctx.req.json().catch(() => ({})));
  const { missing } = await missingSuggestions(t);
  // Only ever names from the suggestion list — this isn't a bulk-create API.
  const toAdd = names ? missing.filter((n) => names.includes(n)) : missing;
  if (toAdd.length) {
    await db.category.createMany({ data: toAdd.map((name) => ({ id: crypto.randomUUID(), tenantId: t.id, name })) });
  }
  return ctx.json({ added: toAdd, message: toAdd.length ? `Added ${toAdd.length} categor${toAdd.length === 1 ? 'y' : 'ies'}.` : 'Nothing to add.' }, 201);
});

categoryRoutes.delete('/:id', async (ctx) => {
  const t = ctx.get('tenant');
  const cat = await db.category.findFirst({ where: { id: ctx.req.param('id'), tenantId: t.id } });
  if (!cat) return ctx.json({ message: 'Not found.' }, 404);
  await db.category.update({ where: { id: cat.id }, data: { deletedAt: new Date() } });
  return ctx.json({ message: 'Category removed.' });
});
