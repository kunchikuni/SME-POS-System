/** POS session + tasks routes — port of PosController + Pos/TaskController */
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
import { branchKind } from '../domain/businessTypes.js';
import { accessState } from '../domain/billing/entitlementService.js';
export const posRoutes = new Hono<{ Variables: HonoVars }>();

// GET /pos/session — device session info for the till
posRoutes.get('/session', async (ctx) => {
  const device = ctx.get('device');
  const tenant = ctx.get('tenant');

  // Fetch fiscal device for this tenant (optional — not all tenants have one)
  const fiscalDevice = await db.fiscalDevice.findUnique({
    where: { tenantId: tenant.id },
    select: { verifiedAt: true, taxpayerTin: true, vatNumber: true },
  });

  // Where this business stands on payment — the till shows a banner from it (and
  // pauses sync once 'lapsed'; see middleware/ensureDeviceSubscribed.ts).
  const access = accessState(tenant as any);

  return ctx.json({
    subscription: { state: access.state, graceEndsAt: access.graceEndsAt?.toISOString() ?? null },
    device: { id: device.id, name: device.name },
    tenant: {
      name: tenant.name,
      currency: tenant.currency,
      taxRateBps: tenant.taxRateBps,
      // branding column stores theme overrides; default to empty object if unset
      theme: (tenant.branding as Record<string, unknown>) ?? {},
      fiscal: {
        verified: fiscalDevice?.verifiedAt != null,
        taxpayerTin: fiscalDevice?.taxpayerTin ?? null,
        vatNumber: fiscalDevice?.vatNumber ?? null,
      },
    },
    branch: {
      id: device.branch.id,
      name: device.branch.name,
      mode: device.branch.mode,
      // What this branch IS ("Butchery", "Pharmacy"…), for the till's header —
      // `mode` only says which till layout to use, and is "retail" for many types.
      kind: branchKind(tenant.mode, device.branch.mode),
      address: device.branch.address ?? null,
      phone: device.branch.phone ?? null,
    },
  });
});


// GET /pos/tasks
posRoutes.get('/tasks', async (ctx) => {
  const tenant = ctx.get('tenant');
  const device = ctx.get('device');
  const tasks = await db.task.findMany({
    where: { tenantId: tenant.id, status: 'open', deletedAt: null, OR: [{ branchId: device.branchId }, { branchId: null }] },
    select: { id: true, title: true, notes: true, dueAt: true, assignedTo: true, assignee: { select: { name: true } } },
    // Soonest due first; undated tasks last, oldest first.
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  });
  // The till's contract (types/contract.ts TillTask) is snake_case with the
  // assignee's NAME — this used to send dueAt/assignedTo, so the till's Tasks
  // panel never showed a due date or an assignee.
  return ctx.json({
    tasks: tasks.map((t: typeof tasks[number]) => ({
      id: t.id,
      title: t.title,
      notes: t.notes,
      due_at: t.dueAt ? t.dueAt.toISOString() : null,
      assignee: t.assignee?.name ?? null,
      assigned_to: t.assignedTo,
    })),
  });
});

// POST /pos/tasks/:id/complete
posRoutes.post('/tasks/:id/complete', async (ctx) => {
  const tenant = ctx.get('tenant');
  let cashierId: string | null = null;
  try {
    const body = await ctx.req.json();
    // The till sends snake_case (`cashier_id`, see apiClient.completeTask). This
    // used to read `cashierId`, which never matched — so nobody was ever
    // recorded as having completed a task from the till.
    const parsed = z.object({ cashier_id: z.string().uuid().nullable().optional(), cashierId: z.string().uuid().nullable().optional() }).safeParse(body);
    if (parsed.success) cashierId = parsed.data.cashier_id ?? parsed.data.cashierId ?? null;
  } catch {
    // no body is fine
  }
  // Only credit someone from THIS business (the foreign key alone would accept any user).
  if (cashierId && !(await db.user.findFirst({ where: { id: cashierId, tenantId: tenant.id }, select: { id: true } }))) cashierId = null;
  const task = await db.task.findFirst({ where: { id: ctx.req.param('id'), tenantId: tenant.id, deletedAt: null } });
  if (!task) return ctx.json({ message: 'Not found.' }, 404);
  const updated = await db.task.update({ where: { id: task.id }, data: { status: 'done', completedAt: new Date(), completedBy: cashierId } });
  return ctx.json(updated);
});
