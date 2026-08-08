/**
 * EnsureSubscribed — port of EnsureSubscribed.php
 *
 * Broad billing gate: trial ended + no active subscription → 402. Passes
 * through payment routes and logout so a blocked tenant can always reach
 * the fix.
 *
 * Two changes from the previous version:
 *  1. Paths now carry the /api prefix (the exempt set silently stopped
 *     matching when the API moved under /api — meaning a lapsed tenant
 *     couldn't reach the payments page to fix their subscription).
 *     Matched via endsWith so the middleware doesn't care where the router
 *     is mounted.
 *  2. Always JSON. This middleware only ever runs on fetch() requests from
 *     the SPA — a 302 redirect here gets followed transparently by fetch,
 *     which then tries to JSON.parse the SPA's HTML shell and surfaces a
 *     parse error instead of the real message. The SPA routes the user to
 *     /settings/payments off the 402 code.
 */
import { createMiddleware } from 'hono/factory';
import { hasAccess } from '../domain/billing/entitlementService.js';
import type { HonoVars } from '../lib/context.js';

const EXEMPT_SUFFIXES = [
  '/settings/payments',
  '/settings/payments/subscribe',
  '/billing/payments',
  '/billing/payments/subscribe',
  '/logout',
];

export const ensureSubscribed = createMiddleware<{ Variables: HonoVars }>(
  async (ctx, next) => {
    const path = new URL(ctx.req.url).pathname;

    if (EXEMPT_SUFFIXES.some((s) => path.endsWith(s))) {
      return next();
    }

    const tenant = ctx.get('tenant');
    if (!tenant) return next();

    if (!hasAccess(tenant)) {
      return ctx.json(
        {
          message: 'Your trial has ended. Choose a plan to keep using Wivae.',
          code: 'subscription_required',
        },
        402,
      );
    }

    await next();
  },
);
