/** Settings routes — port of SettingsController + AccountController + BrandingController */
import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db.js';
import { normalizePhone } from '../lib/phone.js';
import type { HonoVars } from '../lib/context.js';

export const settingsRoutes = new Hono<{ Variables: HonoVars }>();
export const accountRoutes = new Hono<{ Variables: HonoVars }>();
export const brandingRoutes = new Hono<{ Variables: HonoVars }>();

// GET /settings/general
settingsRoutes.get('/general', async (ctx) => {
  const t = ctx.get('tenant');
  return ctx.json({ currency: t.currency, taxRateBps: t.taxRateBps });
});

// PATCH /settings/general
settingsRoutes.patch('/general', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!['owner','manager'].includes(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const d = z.object({ currency: z.string().length(3).optional(), taxRateBps: z.number().int().min(0).max(30000).optional() }).parse(await ctx.req.json());
  await db.tenant.update({ where: { id: t.id }, data: d });
  return ctx.json({ message: 'Settings saved.' });
});

// GET /settings/account
accountRoutes.get('/account', async (ctx) => {
  const u = ctx.get('user');
  const row = await db.user.findUnique({ where: { id: u.id }, select: { phone: true } });
  return ctx.json({ name: u.name, email: u.email, phone: row?.phone ?? null });
});

// PATCH /settings/account/phone -- the mobile number payment reminders are texted to.
// Blank removes it (and so stops the texts).
accountRoutes.patch('/account/phone', async (ctx) => {
  const u = ctx.get('user');
  const { phone: raw } = z.object({ phone: z.string().trim().max(30).nullable() }).parse(await ctx.req.json());
  if (!raw) {
    await db.user.update({ where: { id: u.id }, data: { phone: null } });
    return ctx.json({ message: 'Mobile number removed.', phone: null });
  }
  const phone = normalizePhone(raw);
  if (!phone) {
    return ctx.json({ message: 'That mobile number does not look right.', errors: { phone: 'Enter a mobile number, e.g. 0771234567.' } }, 422);
  }
  await db.user.update({ where: { id: u.id }, data: { phone } });
  return ctx.json({ message: 'Mobile number saved.', phone });
});

// PATCH /settings/account/password
accountRoutes.patch('/account/password', async (ctx) => {
  const u = ctx.get('user');
  const d = z.object({ current_password: z.string(), password: z.string().min(8), password_confirmation: z.string() }).parse(await ctx.req.json());
  if (d.password !== d.password_confirmation) return ctx.json({ message: 'Passwords do not match.' }, 422);
  const user = await db.user.findUnique({ where: { id: u.id } });
  if (!user || !(await bcrypt.compare(d.current_password, user.password ?? ''))) return ctx.json({ message: 'Current password is incorrect.' }, 422);
  await db.user.update({ where: { id: u.id }, data: { password: await bcrypt.hash(d.password, 12) } });
  return ctx.json({ message: 'Password updated.' });
});

// GET /settings/branding
brandingRoutes.get('/branding', async (ctx) => {
  const t = ctx.get('tenant');
  return ctx.json({ branding: t.branding });
});

// PATCH /settings/branding
brandingRoutes.patch('/branding', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!['owner'].includes(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const d = z.object({ name: z.string().optional(), logo: z.string().nullable().optional(), primaryColor: z.string().optional(), accentColor: z.string().optional() }).parse(await ctx.req.json());
  const branding = { ...(t.branding as object ?? {}), ...d };
  await db.tenant.update({ where: { id: t.id }, data: { branding } });
  return ctx.json({ message: 'Branding saved.', branding });
});
