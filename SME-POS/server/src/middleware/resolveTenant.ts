/**
 * Tenant resolution middleware — port of ResolveTenant.php
 *
 * Reads the subdomain from the Host header, looks up the tenant in Postgres,
 * and binds it to the Hono context as `ctx.get('tenant')`.
 *
 *   acme.wivae.test  →  tenant with subdomain "acme"
 *
 * Applied to tenant routes only. Central routes (bare domain) skip this.
 *
 * Key invariants preserved from the Laravel version:
 *   - Auth user lookups BYPASS this tenant scope (see auth.ts) — the tenant
 *     is verified explicitly against the user record after loading.
 *   - Suspended tenants get a 404, same as unknown subdomains.
 */
import { createMiddleware } from 'hono/factory';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';

const ROOT_DOMAIN = process.env.TENANT_DOMAIN ?? 'wivae.test';

export const resolveTenant = createMiddleware<{ Variables: HonoVars }>(
  async (ctx, next) => {
    const host = ctx.req.header('host') ?? '';
    // Strip port if present (e.g. "acme.wivae.test:3000" → "acme.wivae.test")
    const hostname = host.split(':')[0];

    const suffix = '.' + ROOT_DOMAIN;
    if (!hostname.endsWith(suffix)) {
      return ctx.json({ message: 'No tenant for this host.' }, 404);
    }

    const subdomain = hostname.slice(0, hostname.length - suffix.length);
    if (!subdomain) {
      return ctx.json({ message: 'No tenant for this host.' }, 404);
    }

    const tenant = await db.tenant.findFirst({
      where: { subdomain, status: { not: 'suspended' }, deletedAt: null },
      include: {
        subscriptions: {
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, zimraAddon: true, currentPeriodEnd: true },
        },
      },
    });

    if (!tenant) {
      return ctx.json({ message: 'Unknown tenant.' }, 404);
    }

    // Flatten the subscription for convenience on ctx.get('tenant')
    const { subscriptions, ...tenantData } = tenant as typeof tenant & { subscriptions: typeof tenant.subscriptions };
    const tenantWithSub = {
      ...tenantData,
      subscription: subscriptions[0] ?? null,
    };

    ctx.set('tenant', tenantWithSub as any);
    await next();
  },
);
