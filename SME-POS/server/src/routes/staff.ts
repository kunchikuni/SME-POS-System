/** Staff routes — port of StaffController */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';

export const staffRoutes = new Hono<{ Variables: HonoVars }>();

const ADMIN_ROLES = new Set(['owner', 'manager']);
const DASHBOARD_ROLES = new Set(['owner', 'manager']);

function generatePin(): string {
  return crypto.randomInt(1000, 10000).toString(); // CSPRNG, uniform 1000–9999
}

function generateTempPassword(): string {
  return crypto.randomBytes(8).toString('hex');
}

// GET /staff
staffRoutes.get('/', async (ctx) => {
  const tenant = ctx.get('tenant');
  const branches = await db.branch.findMany({
    where: { tenantId: tenant.id, isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });
  const staff = await db.user.findMany({
    where: { tenantId: tenant.id },
    include: { branch: { select: { name: true } } },
    orderBy: [{ name: 'asc' }],
  });

  const roleOrder: Record<string, number> = { owner: 0, manager: 1, cashier: 2, waiter: 3 };
  const data = [...staff]
    .sort((a, b) => (roleOrder[a.role] ?? 4) - (roleOrder[b.role] ?? 4))
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      branch: u.branch?.name ?? null,
      branchId: u.branchId,
      hasPin: u.pinHash !== null,
      dashboard: DASHBOARD_ROLES.has(u.role),
      deletedAt: u.deletedAt,
    }));

  return ctx.json({ staff: data, branches });
});

// POST /staff
staffRoutes.post('/', async (ctx) => {
  const user = ctx.get('user');
  if (!ADMIN_ROLES.has(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const body = await ctx.req.json();
  const data = z.object({
    name: z.string().min(1).max(100),
    role: z.enum(['owner', 'manager', 'cashier', 'waiter']),
    branchId: z.string().uuid().nullable().optional(),
    email: z.string().email().nullable().optional(),
  }).parse(body);

  const isDashboard = DASHBOARD_ROLES.has(data.role);
  if (isDashboard && !data.email) {
    return ctx.json({ errors: { email: 'Owners and managers need an email to sign in.' } }, 422);
  }

  const credential = isDashboard ? generateTempPassword() : generatePin();
  const pinHash = !isDashboard ? await bcrypt.hash(credential, 10) : null;
  const password = isDashboard ? await bcrypt.hash(credential, 12) : null;

  const newUser = await db.user.create({
    data: {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      name: data.name,
      role: data.role,
      branchId: data.branchId ?? null,
      email: isDashboard ? data.email! : '',
      password: password ?? '',
      pinHash,
    },
  });

  return ctx.json({
    staffCredential: { name: newUser.name, kind: isDashboard ? 'password' : 'pin', value: credential },
    message: `Added ${newUser.name}.`,
  }, 201);
});

// PATCH /staff/:id
staffRoutes.patch('/:id', async (ctx) => {
  const currentUser = ctx.get('user');
  if (!ADMIN_ROLES.has(currentUser.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const body = await ctx.req.json();
  const data = z.object({
    name: z.string().min(1).max(100),
    role: z.enum(['owner', 'manager', 'cashier', 'waiter']),
    branchId: z.string().uuid().nullable().optional(),
    email: z.string().email().nullable().optional(),
  }).parse(body);

  const staffMember = await db.user.findFirst({ where: { id: ctx.req.param('id'), tenantId: tenant.id } });
  if (!staffMember) return ctx.json({ message: 'Not found.' }, 404);

  const isDashboard = DASHBOARD_ROLES.has(data.role);
  await db.user.update({
    where: { id: staffMember.id },
    data: {
      name: data.name,
      role: data.role,
      branchId: data.branchId ?? null,
      email: isDashboard ? (data.email ?? staffMember.email ?? '') : '',
      // Clear password for till-only staff by setting to empty string
      // (they cannot authenticate to the dashboard regardless — auth checks role)
      password: !isDashboard ? '' : undefined,
    },
  });

  return ctx.json({ message: `Updated ${data.name}.` });
});

// DELETE /staff/:id
staffRoutes.delete('/:id', async (ctx) => {
  const currentUser = ctx.get('user');
  if (!ADMIN_ROLES.has(currentUser.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const staffMember = await db.user.findFirst({ where: { id: ctx.req.param('id'), tenantId: tenant.id } });
  if (!staffMember) return ctx.json({ message: 'Not found.' }, 404);
  if (staffMember.id === currentUser.id) return ctx.json({ message: "You can't deactivate your own account." }, 422);
  if (staffMember.role === 'owner') return ctx.json({ message: "The owner account can't be deactivated." }, 422);

  await db.user.update({ where: { id: staffMember.id }, data: { deletedAt: new Date() } });
  return ctx.json({ message: `Deactivated ${staffMember.name}.` });
});

// POST /staff/:id/restore
staffRoutes.post('/:id/restore', async (ctx) => {
  const currentUser = ctx.get('user');
  if (!ADMIN_ROLES.has(currentUser.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const staffMember = await db.user.findFirst({ where: { id: ctx.req.param('id'), tenantId: tenant.id } });
  if (!staffMember) return ctx.json({ message: 'Not found.' }, 404);

  await db.user.update({ where: { id: staffMember.id }, data: { deletedAt: null } });
  return ctx.json({ message: `Reactivated ${staffMember.name}.` });
});

// POST /staff/:id/reset-pin
staffRoutes.post('/:id/reset-pin', async (ctx) => {
  const currentUser = ctx.get('user');
  if (!ADMIN_ROLES.has(currentUser.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const staffMember = await db.user.findFirst({ where: { id: ctx.req.param('id'), tenantId: tenant.id, deletedAt: null } });
  if (!staffMember) return ctx.json({ message: 'Not found.' }, 404);

  const pin = generatePin();
  await db.user.update({ where: { id: staffMember.id }, data: { pinHash: await bcrypt.hash(pin, 10) } });
  return ctx.json({ staffCredential: { name: staffMember.name, kind: 'pin', value: pin }, message: `PIN reset for ${staffMember.name}.` });
});

// POST /staff/:id/reset-password
staffRoutes.post('/:id/reset-password', async (ctx) => {
  const currentUser = ctx.get('user');
  if (!ADMIN_ROLES.has(currentUser.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const staffMember = await db.user.findFirst({ where: { id: ctx.req.param('id'), tenantId: tenant.id, deletedAt: null } });
  if (!staffMember) return ctx.json({ message: 'Not found.' }, 404);
  if (!DASHBOARD_ROLES.has(staffMember.role)) {
    return ctx.json({ message: 'This account is till-only and has no dashboard password.' }, 422);
  }

  const password = generateTempPassword();
  await db.user.update({ where: { id: staffMember.id }, data: { password: await bcrypt.hash(password, 12) } });
  return ctx.json({ staffCredential: { name: staffMember.name, kind: 'password', value: password }, message: `Password reset for ${staffMember.name}.` });
});
