/** Sync API routes — port of SyncController */
import { Hono } from 'hono';
import { z } from 'zod';
import * as syncService from '../domain/pos/syncService.js';
import type { HonoVars } from '../lib/context.js';

export const syncRoutes = new Hono<{ Variables: HonoVars }>();

// GET /sync/bootstrap — full snapshot for a new device
syncRoutes.get('/bootstrap', async (ctx) => {
  const device = ctx.get('device');
  const tenant = ctx.get('tenant');
  const data = await syncService.bootstrap(tenant.id, device.branchId);
  return ctx.json(data);
});

// POST /sync/push — idempotent batch of local mutations
syncRoutes.post('/push', async (ctx) => {
  const body = await ctx.req.json();
  const { mutations } = z
    .object({ mutations: z.array(z.object({ type: z.string() }).passthrough()) })
    .parse(body);

  const device = ctx.get('device');
  const tenant = ctx.get('tenant');

  const result = await syncService.push(
    mutations as any,
    tenant.id,
    device.id,
    device.branchId,
  );
  return ctx.json(result);
});

// GET /sync/pull?since=<ISO cursor>
syncRoutes.get('/pull', async (ctx) => {
  const since = ctx.req.query('since');
  if (!since) return ctx.json({ message: 'Missing ?since= cursor.' }, 400);

  const device = ctx.get('device');
  const tenant = ctx.get('tenant');

  const data = await syncService.pull(tenant.id, device.branchId, since);
  return ctx.json(data);
});
