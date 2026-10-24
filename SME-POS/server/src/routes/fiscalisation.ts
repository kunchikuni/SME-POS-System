/** Fiscalisation routes — port of FiscalisationController (ZIMRA FDMS) */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const fiscalisationRoutes = new Hono<{ Variables: HonoVars }>();
fiscalisationRoutes.get('/fiscalisation', async (ctx) => {
  const t = ctx.get('tenant');
  const device = await db.fiscalDevice.findUnique({ where: { tenantId: t.id } });
  return ctx.json({ device, zimraEnabled: t.zimraEnabled });
});
fiscalisationRoutes.patch('/fiscalisation/toggle', async (ctx) => {
  const t = ctx.get('tenant');
  const updated = await db.tenant.update({ where: { id: t.id }, data: { zimraEnabled: !t.zimraEnabled } });
  return ctx.json({ zimraEnabled: updated.zimraEnabled });
});
fiscalisationRoutes.post('/fiscalisation/device', async (ctx) => {
  const t = ctx.get('tenant');
  const d = z.object({ zimraDeviceId: z.number().int().optional(), activationKey: z.string().length(8).optional(), deviceSerialNo: z.string().optional() }).parse(await ctx.req.json());
  const device = await db.fiscalDevice.upsert({
    where: { tenantId: t.id },
    create: { id: crypto.randomUUID(), tenantId: t.id, ...d },
    update: d,
  });
  return ctx.json(device);
});
fiscalisationRoutes.post('/fiscalisation/verify', async (ctx) => {
  // ZIMRA verifyTaxpayerInformation — external API call placeholder
  return ctx.json({ message: 'ZIMRA verify — see FiscalisationService.ts' }, 501);
});
