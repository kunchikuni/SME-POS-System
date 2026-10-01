/** Tasks routes — port of TaskController */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
import { localToday } from '../lib/businessDay.js';
export const taskRoutes = new Hono<{ Variables: HonoVars }>();
const ADMIN = new Set(['owner','manager']);

/**
 * A due date is a CALENDAR DAY, not an instant. "2026-10-05" is stored at
 * 12:00 UTC: noon is the one time of day whose calendar date is the same in
 * every timezone (±12h), so the day never shifts whether it's shown in
 * Harare or Honolulu. (Stored at midnight UTC it read as the previous day
 * anywhere west of Greenwich.) An empty string or null clears the date.
 */
function parseDue(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;             // not provided → leave as is
  if (value === null || value.trim() === '') return null; // explicitly cleared
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
}

const due = z.string().nullable().optional().refine(
  (v) => v == null || v.trim() === '' || !Number.isNaN(parseDue(v)?.getTime()),
  'That isn’t a valid date.',
);
const fields = {
  title: z.string().trim().min(1, 'Give the task a title.').max(200),
  notes: z.string().trim().max(2000).nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  dueAt: due,
};

/** An assignee / branch id must belong to THIS business — the foreign key alone would accept another business's. */
async function checkOwnership(tenantId: string, d: { assignedTo?: string | null; branchId?: string | null }) {
  if (d.assignedTo && !(await db.user.findFirst({ where: { id: d.assignedTo, tenantId, deletedAt: null }, select: { id: true } }))) {
    return { errors: { assignedTo: 'Choose someone from your staff.' } };
  }
  if (d.branchId && !(await db.branch.findFirst({ where: { id: d.branchId, tenantId, deletedAt: null }, select: { id: true } }))) {
    return { errors: { branchId: 'Choose one of your branches.' } };
  }
  return null;
}

taskRoutes.get('/', async (ctx) => {
  const t = ctx.get('tenant'); const u = ctx.get('user');
  const tasks = await db.task.findMany({
    where: { tenantId: t.id, deletedAt: null, ...(u.branchId ? { OR: [{ branchId: u.branchId }, { branchId: null }] } : {}) },
    include: {
      assignee: { select: { id: true, name: true } },
      creator: { select: { name: true } },
      completer: { select: { name: true } },
      branch: { select: { name: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  // `today` is the business's today (not the browser's), so "overdue" agrees everywhere.
  return ctx.json({ tasks, today: localToday() });
});
taskRoutes.post('/', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!ADMIN.has(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const d = z.object(fields).parse(await ctx.req.json());
  const bad = await checkOwnership(t.id, d);
  if (bad) return ctx.json({ message: 'The given data was invalid.', ...bad }, 422);
  const task = await db.task.create({ data: { id: crypto.randomUUID(), tenantId: t.id, title: d.title, notes: d.notes || null, branchId: d.branchId ?? null, assignedTo: d.assignedTo ?? null, createdBy: u.id, dueAt: parseDue(d.dueAt) ?? null } });
  return ctx.json(task, 201);
});
taskRoutes.patch('/:id', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!ADMIN.has(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const task = await db.task.findFirst({ where: { id: ctx.req.param('id'), tenantId: t.id, deletedAt: null } });
  if (!task) return ctx.json({ message: 'Not found.' }, 404);
  const d = z.object(fields).partial().parse(await ctx.req.json());
  const bad = await checkOwnership(t.id, d);
  if (bad) return ctx.json({ message: 'The given data was invalid.', ...bad }, 422);
  const { dueAt, notes, ...rest } = d;
  const updated = await db.task.update({
    where: { id: task.id },
    data: { ...rest, ...(notes !== undefined ? { notes: notes || null } : {}), ...(dueAt !== undefined ? { dueAt: parseDue(dueAt) } : {}) },
  });
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
  // Look it up first: deleting an id that isn't this business's (or is already
  // gone) is a clean 404, not an unhandled "record not found" 500.
  const task = await db.task.findFirst({ where: { id: ctx.req.param('id'), tenantId: t.id, deletedAt: null } });
  if (!task) return ctx.json({ message: 'Not found.' }, 404);
  await db.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
  return ctx.json({ message: 'Task removed.' });
});
