/**
 * Auth routes — port of AuthenticatedSessionController + RegisteredTenantController
 * Handles login, logout, and tenant registration.
 *
 * Sessions go through ctx.get('session') (hono-sessions' real API). See
 * middleware/auth.ts for why the previous (ctx.req.raw as any).session
 * pattern authenticated nobody.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';

export const authRoutes = new Hono<{ Variables: HonoVars }>();

// A real bcrypt hash of a random string, used to equalize timing when the
// email doesn't exist: without it, "unknown email" returns measurably faster
// than "wrong password", letting an attacker enumerate which emails have
// accounts on a tenant.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

// POST /login
authRoutes.post('/login', async (ctx) => {
  const body = await ctx.req.json().catch(() => ({}));
  const { email, password } = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .parse(body);

  const tenant = ctx.get('tenant');

  const user = await db.user.findFirst({
    where: { tenantId: tenant.id, email, deletedAt: null },
  });

  const passwordOk = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);

  if (!user || !user.password || !passwordOk) {
    return ctx.json({ message: 'These credentials do not match our records.' }, 422);
  }

  ctx.get('session').set('userId', user.id);

  return ctx.json({ user: { id: user.id, name: user.name, role: user.role } });
});

// POST /logout
authRoutes.post('/logout', async (ctx) => {
  // deleteSession() invalidates the whole session server-side representation
  // and expires the cookie — strictly better than zeroing one key, which
  // would leave any other session state (and the cookie itself) alive.
  ctx.get('session').deleteSession();
  return ctx.json({ message: 'Logged out.' });
});

// GET /me — current user + tenant for the React auth context
authRoutes.get('/me', async (ctx) => {
  const userId = ctx.get('session')?.get('userId') as string | undefined;
  if (!userId) return ctx.json({ user: null, tenant: null });

  const tenant = ctx.get('tenant');

  // Same cross-tenant check as requireAuth: a session minted on tenant-A
  // must not present itself as logged-in on tenant-B's subdomain.
  const user = await db.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user || user.tenantId !== tenant?.id) return ctx.json({ user: null, tenant: null });

  return ctx.json({
    user: { id: user.id, name: user.name, role: user.role, email: user.email || null },
    tenant: tenant ? {
      id: tenant.id,
      name: tenant.name,
      subdomain: tenant.subdomain,
      currency: tenant.currency,
      plan: tenant.plan,
      trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
      taxRateBps: tenant.taxRateBps,
      branding: tenant.branding,
    } : null,
  });
});

// POST /register — central domain (no tenant)
authRoutes.post('/register', async (ctx) => {
  const body = await ctx.req.json().catch(() => ({}));
  const data = z
    .object({
      name: z.string().min(1),
      subdomain: z.string().min(3).max(30).regex(/^[a-z0-9-]+$/),
      email: z.string().email(),
      password: z.string().min(8),
    })
    .parse(body);

  const existing = await db.tenant.findUnique({ where: { subdomain: data.subdomain } });
  if (existing) {
    return ctx.json({ message: 'That subdomain is already taken.' }, 422);
  }

  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const branchId = crypto.randomUUID();

  await db.$transaction([
    db.tenant.create({
      data: {
        id: tenantId,
        name: data.name,
        subdomain: data.subdomain,
        plan: 'trial',
        trialEndsAt,
      },
    }),
    db.branch.create({
      data: {
        id: branchId,
        tenantId,
        name: 'Main Branch',
        isDefault: true,
      },
    }),
    db.user.create({
      data: {
        id: userId,
        tenantId,
        name: data.name,
        email: data.email,
        password: await bcrypt.hash(data.password, 12),
        role: 'owner',
      },
    }),
  ]);

  return ctx.json({ subdomain: data.subdomain }, 201);
});
