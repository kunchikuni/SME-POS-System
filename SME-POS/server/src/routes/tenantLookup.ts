/** Tenant lookup — port of TenantLookupController */
import { Hono } from 'hono';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const tenantLookupRoutes = new Hono<{ Variables: HonoVars }>();
tenantLookupRoutes.get('/tenant-lookup', async (ctx) => {
  const subdomain = ctx.req.query('subdomain');
  if (!subdomain) return ctx.json({ exists: false });
  const tenant = await db.tenant.findUnique({ where: { subdomain }, select: { id: true } });
  return ctx.json({ exists: !!tenant });
});
