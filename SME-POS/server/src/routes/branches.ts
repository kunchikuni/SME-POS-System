/** Branches routes — port of BranchController */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { canAddBranch } from '../domain/billing/entitlementService.js';
import type { HonoVars } from '../lib/context.js';
export const branchRoutes = new Hono<{ Variables: HonoVars }>();
const ADMIN_ROLES = new Set(['owner', 'manager']);

branchRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant');
  const branches = await db.branch.findMany({ where: { tenantId: t.id, deletedAt: null }, orderBy: { createdAt: 'asc' } });
  return ctx.json({ branches });
});
branchRoutes.post('/', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!ADMIN_ROLES.has(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const count = await db.branch.count({ where: { tenantId: t.id, deletedAt: null } });
  if (!canAddBranch(t, count)) return ctx.json({ message: 'Branch limit reached for your plan.' }, 403);
  const d = z.object({ name: z.string().min(1), address: z.string().nullable().optional(), mode: z.enum(['retail','restaurant']).default('retail') }).parse(await ctx.req.json());
  const b = await db.branch.create({ data: { id: crypto.randomUUID(), tenantId: t.id, name: d.name, address: d.address ?? null, mode: d.mode } });
  return ctx.json(b, 201);
});
branchRoutes.patch('/:id', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!ADMIN_ROLES.has(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const branch = await db.branch.findFirst({ where: { id: ctx.req.param('id'), tenantId: t.id } });
  if (!branch) return ctx.json({ message: 'Not found.' }, 404);
  const d = z.object({ name: z.string().min(1).optional(), address: z.string().nullable().optional(), mode: z.enum(['retail','restaurant']).optional(), isActive: z.boolean().optional() }).parse(await ctx.req.json());
  const updated = await db.branch.update({ where: { id: branch.id }, data: d });
  return ctx.json(updated);
});
branchRoutes.delete('/:id', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!ADMIN_ROLES.has(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const branch = await db.branch.findFirst({ where: { id: ctx.req.param('id'), tenantId: t.id } });
  if (!branch) return ctx.json({ message: 'Not found.' }, 404);
  await db.branch.update({ where: { id: branch.id }, data: { deletedAt: new Date() } });
  return ctx.json({ message: 'Branch removed.' });
});
