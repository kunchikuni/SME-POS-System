/** Tenant lookup — port of TenantLookupController */
import { Hono } from 'hono';
import { db } from '../lib/db.js';
import { RESERVED_SUBDOMAINS } from './auth.js';
import type { HonoVars } from '../lib/context.js';
export const tenantLookupRoutes = new Hono<{ Variables: HonoVars }>();

// GET /tenant-lookup?subdomain= — used by the marketing "install the till"
// form (does this workspace exist?) and the sign-up form's live
// availability check (is this name free to take?).
tenantLookupRoutes.get('/tenant-lookup', async (ctx) => {
  const subdomain = ctx.req.query('subdomain')?.trim().toLowerCase();
  if (!subdomain) return ctx.json({ exists: false, reserved: false });
  const tenant = await db.tenant.findUnique({ where: { subdomain }, select: { id: true } });
  return ctx.json({ exists: !!tenant, reserved: RESERVED_SUBDOMAINS.has(subdomain) });
});
