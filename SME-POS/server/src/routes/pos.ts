/** POS session + tasks routes — port of PosController + Pos/TaskController */
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const posRoutes = new Hono<{ Variables: HonoVars }>();

// GET /pos/session — device session info for the till
posRoutes.get('/session', async (ctx) => {
  const device = ctx.get('device');
  const tenant = ctx.get('tenant');
  return ctx.json({
    device: { id: device.id, name: device.name, branchId: device.branchId },
    tenant: { id: tenant.id, name: tenant.name, currency: tenant.currency, taxRateBps: tenant.taxRateBps },
    branch: device.branch,
  });
});

// GET /pos/tasks
posRoutes.get('/tasks', async (ctx) => {
  const tenant = ctx.get('tenant');
  const device = ctx.get('device');
  const tasks = await db.task.findMany({
    where: { tenantId: tenant.id, status: 'open', deletedAt: null, OR: [{ branchId: device.branchId }, { branchId: null }] },
    select: { id: true, title: true, notes: true, dueAt: true, assignedTo: true },
    orderBy: { createdAt: 'asc' },
  });
  return ctx.json({ tasks });
});

// POST /pos/tasks/:id/complete
posRoutes.post('/tasks/:id/complete', async (ctx) => {
  const tenant = ctx.get('tenant');
  let cashierId: string | undefined;
  try {
    const body = await ctx.req.json();
    const parsed = z.object({ cashierId: z.string().uuid().optional() }).safeParse(body);
    if (parsed.success) cashierId = parsed.data.cashierId;
  } catch {
    // no body is fine
  }
  const task = await db.task.findFirst({ where: { id: ctx.req.param('id'), tenantId: tenant.id, deletedAt: null } });
  if (!task) return ctx.json({ message: 'Not found.' }, 404);
  const updated = await db.task.update({ where: { id: task.id }, data: { status: 'done', completedAt: new Date(), completedBy: cashierId ?? null } });
  return ctx.json(updated);
});
