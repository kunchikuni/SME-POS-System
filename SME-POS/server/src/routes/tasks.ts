/** Tasks routes — port of TaskController */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const taskRoutes = new Hono<{ Variables: HonoVars }>();
const ADMIN = new Set(['owner','manager']);

taskRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant'); const u = ctx.get('user');
  const tasks = await db.task.findMany({
    where: { tenantId: t.id, deletedAt: null, ...(u.branchId ? { OR: [{ branchId: u.branchId }, { branchId: null }] } : {}) },
    include: { assignee: { select: { name: true } }, creator: { select: { name: true } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  return ctx.json({ tasks });
});
taskRoutes.post('/', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!ADMIN.has(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const d = z.object({ title: z.string().min(1), notes: z.string().nullable().optional(), branchId: z.string().uuid().nullable().optional(), assignedTo: z.string().uuid().nullable().optional(), dueAt: z.string().nullable().optional() }).parse(await ctx.req.json());
  const task = await db.task.create({ data: { id: crypto.randomUUID(), tenantId: t.id, title: d.title, notes: d.notes ?? null, branchId: d.branchId ?? null, assignedTo: d.assignedTo ?? null, createdBy: u.id, dueAt: d.dueAt ? new Date(d.dueAt) : null } });
  return ctx.json(task, 201);
});
taskRoutes.patch('/:id', async (ctx) => {
  const t = ctx.get('tenant');
  const task = await db.task.findFirst({ where: { id: ctx.req.param('id'), tenantId: t.id, deletedAt: null } });
  if (!task) return ctx.json({ message: 'Not found.' }, 404);
  const d = z.object({ title: z.string().min(1).optional(), notes: z.string().nullable().optional(), assignedTo: z.string().uuid().nullable().optional(), dueAt: z.string().nullable().optional() }).parse(await ctx.req.json());
  const updated = await db.task.update({ where: { id: task.id }, data: { ...d, dueAt: d.dueAt ? new Date(d.dueAt) : undefined } });
  return ctx.json(updated);
});
taskRoutes.post('/:id/complete', async (ctx) => {
  const t = ctx.get('tenant'); const u = ctx.get('user');
  const task = await db.task.findFirst({ where: { id: ctx.req.param('id'), tenantId: t.id, deletedAt: null } });
  if (!task) return ctx.json({ message: 'Not found.' }, 404);
  const updated = await db.task.update({ where: { id: task.id }, data: { status: 'done', completedAt: new Date(), completedBy: u.id } });
  return ctx.json(updated);
});
taskRoutes.post('/:id/reopen', async (ctx) => {
  const t = ctx.get('tenant');
  const task = await db.task.findFirst({ where: { id: ctx.req.param('id'), tenantId: t.id, deletedAt: null } });
  if (!task) return ctx.json({ message: 'Not found.' }, 404);
  const updated = await db.task.update({ where: { id: task.id }, data: { status: 'open', completedAt: null, completedBy: null } });
  return ctx.json(updated);
});
taskRoutes.delete('/:id', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!ADMIN.has(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  await db.task.update({ where: { id: ctx.req.param('id') }, data: { deletedAt: new Date() } });
  return ctx.json({ message: 'Task removed.' });
});
