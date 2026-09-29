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
  const d = z.object({ name: z.string().min(1), address: z.string().nullable().optional(), mode: z.enum(['retail','restaurant','hardware','workshop']).default('retail') }).parse(await ctx.req.json());
  const b = await db.branch.create({ data: { id: crypto.randomUUID(), tenantId: t.id, name: d.name, address: d.address ?? null, mode: d.mode } });
  return ctx.json(b, 201);
});
branchRoutes.patch('/:id', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!ADMIN_ROLES.has(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const branch = await db.branch.findFirst({ where: { id: ctx.req.param('id'), tenantId: t.id, deletedAt: null } });
  if (!branch) return ctx.json({ message: 'Not found.' }, 404);
  const d = z.object({ name: z.string().min(1).optional(), address: z.string().nullable().optional(), mode: z.enum(['retail','restaurant','hardware','workshop']).optional(), isActive: z.boolean().optional(), isDefault: z.literal(true).optional() }).parse(await ctx.req.json());
  const { isDefault, ...fields } = d;
  // Exactly one default per tenant: promoting this branch demotes the rest in
  // the same transaction. (Only `true` is accepted — "un-defaulting" would
  // leave the tenant with none.)
  if (!isDefault) {
    return ctx.json(await db.branch.update({ where: { id: branch.id }, data: fields }));
  }
  const [, updated] = await db.$transaction([
    db.branch.updateMany({ where: { tenantId: t.id, isDefault: true, NOT: { id: branch.id } }, data: { isDefault: false } }),
    db.branch.update({ where: { id: branch.id }, data: { ...fields, isDefault: true } }),
  ]);
  return ctx.json(updated);
});
branchRoutes.delete('/:id', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!ADMIN_ROLES.has(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const branch = await db.branch.findFirst({ where: { id: ctx.req.param('id'), tenantId: t.id, deletedAt: null } });
  if (!branch) return ctx.json({ message: 'Not found.' }, 404);
  // The default branch is where restocks, new-product opening stock and CSV
  // imports land when no branch is chosen — removing it would silently
  // redirect all of that to whichever branch sorts next.
  if (branch.isDefault) {
    return ctx.json({ message: 'This is your default branch. Make another branch the default before removing it.' }, 422);
  }
  // A till's device token is bound to its branch; removing the branch left
  // those tills still selling and receiving stock into a deleted branch,
  // whose stock no longer shows anywhere in the dashboard.
  const activeDevices = await db.device.count({ where: { branchId: branch.id, deletedAt: null } });
  if (activeDevices > 0) {
    return ctx.json({
      message: `${branch.name} still has ${activeDevices} till${activeDevices === 1 ? '' : 's'} paired. Remove ${activeDevices === 1 ? 'it' : 'them'} under Devices first.`,
    }, 422);
  }
  await db.branch.update({ where: { id: branch.id }, data: { deletedAt: new Date() } });
  return ctx.json({ message: 'Branch removed.' });
});
