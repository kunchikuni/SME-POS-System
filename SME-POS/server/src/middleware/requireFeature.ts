/**
 * RequireFeature — port of RequireFeature.php
 *
 * Gates a route group behind a plan feature.
 * Usage in route definition:
 *   app.use('/payroll/*', requireFeature('payroll'))
 *   app.use('/ai-insights/*', requireFeature('ai insights'))
 *
 * Returns a stable `code: 'plan_upgrade_required'` alongside the message so
 * the frontend can distinguish "you're on the wrong plan" from any other
 * error and render a proper upgrade card instead of an empty page or a
 * generic error string — see Components/UpgradeRequired.tsx.
 */
import { createMiddleware } from 'hono/factory';
import { hasFeature } from '../domain/billing/entitlementService.js';
import type { HonoVars } from '../lib/context.js';

export function requireFeature(feature: string) {
  return createMiddleware<{ Variables: HonoVars }>(async (ctx, next) => {
    const tenant = ctx.get('tenant');
    if (!tenant) {
      return ctx.json({ message: 'Not found.' }, 404);
    }

    if (!hasFeature(tenant, feature)) {
      return ctx.json(
        {
          message:
            "This feature isn't included on your current plan. Visit Settings > Payments to upgrade.",
          code: 'plan_upgrade_required',
          feature,
          plan: tenant.plan,
        },
        403,
      );
    }

    await next();
  });
}
