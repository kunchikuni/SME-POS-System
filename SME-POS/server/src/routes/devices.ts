/** Devices routes — port of DeviceController */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const deviceRoutes = new Hono<{ Variables: HonoVars }>();

deviceRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant');
  const [devices, branches] = await Promise.all([
    db.device.findMany({ where: { tenantId: t.id, deletedAt: null }, include: { branch: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
    db.branch.findMany({ where: { tenantId: t.id, isActive: true, deletedAt: null }, select: { id: true, name: true } }),
  ]);
  return ctx.json({ devices: devices.map((dev: typeof devices[number]) => ({ id: dev.id, name: dev.name, branch: dev.branch.name, lastSeenAt: dev.lastSeenAt })), branches });
});

deviceRoutes.post('/', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!['owner','manager'].includes(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const d = z.object({ name: z.string().min(1), branchId: z.string().uuid() }).parse(await ctx.req.json());
  const branch = await db.branch.findFirst({ where: { id: d.branchId, tenantId: t.id, deletedAt: null } });
  if (!branch) return ctx.json({ message: 'Branch not found.' }, 404);

  // Generate a random bearer token — revealed once, never stored plaintext
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const device = await db.device.create({ data: { id: crypto.randomUUID(), tenantId: t.id, branchId: d.branchId, name: d.name, tokenHash } });
  // Token is returned only here — the raw value is never stored
  return ctx.json({ id: device.id, name: device.name, token }, 201);
});

deviceRoutes.delete('/:id', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!['owner','manager'].includes(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const device = await db.device.findFirst({ where: { id: ctx.req.param('id'), tenantId: t.id } });
  if (!device) return ctx.json({ message: 'Not found.' }, 404);
  await db.device.update({ where: { id: device.id }, data: { deletedAt: new Date() } });
  return ctx.json({ message: 'Device removed.' });
});
