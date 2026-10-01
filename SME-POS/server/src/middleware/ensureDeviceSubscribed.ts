/**
 * The payment gate for the TILL's routes (sync and tasks).
 *
 * ensureSubscribed guards the dashboard, but the till authenticates with a
 * device token on its own routes, which never checked payment: a business
 * whose trial ended — or who never paid — kept selling and syncing for ever,
 * with only the dashboard locked.
 *
 * What a till gets once its grace period (DEVICE_GRACE_DAYS) is over is a 402
 * with a stable `subscription_required` code. The till understands it: sales
 * keep being rung up and saved on the device, sync simply pauses, and the
 * queued sales are NOT counted as failed. When the owner renews, the next sync
 * delivers everything.
 *
 * /pos/session is deliberately NOT behind this: it is how the till finds out
 * what state it is in (see routes/pos.ts), and it must keep answering.
 */
import { createMiddleware } from 'hono/factory';
import { accessState } from '../domain/billing/entitlementService.js';
import type { HonoVars } from '../lib/context.js';

export const ensureDeviceSubscribed = createMiddleware<{ Variables: HonoVars }>(async (ctx, next) => {
  const tenant = ctx.get('tenant');
  if (!tenant) return next();

  if (accessState(tenant as any).state === 'lapsed') {
    return ctx.json(
      {
        message: 'Your subscription has ended. Sales stay saved on this device and will sync once you renew.',
        code: 'subscription_required',
      },
      402,
    );
  }

  await next();
});
