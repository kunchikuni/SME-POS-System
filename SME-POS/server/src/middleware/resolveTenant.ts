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
 *
 * Also the ONLY place that calls runWithTenant() — every downstream handler,
 * service function, and Prisma query for the rest of THIS request runs
 * inside that AsyncLocalStorage context, which is what makes db.ts's
 * automatic tenant scoping (tenantScope.ts) actually take effect. A route
 * added without ever running through this middleware would have no tenant
 * in context at all, and any tenant-scoped query it makes would throw
 * rather than silently run unscoped — see tenantScope.ts for why that's
 * the deliberate failure mode, not a bug.
 */
import { createMiddleware } from 'hono/factory';
import { db } from '../lib/db.js';
import { runWithTenant } from '../lib/tenantScope.js';
import type { HonoVars } from '../lib/context.js';

const ROOT_DOMAIN = process.env.TENANT_DOMAIN ?? 'localhost';

export const resolveTenant = createMiddleware<{ Variables: HonoVars }>(
    async (ctx, next) => {
        // X-Forwarded-Host is set by the Vite dev proxy (xfwd: true in vite.config.ts)
        // and takes precedence over the raw Host header, which some proxy layers
        // replace with the target's hostname (e.g. "localhost:3000"). Reading it first
        // ensures subdomain extraction works correctly in both dev and production.
        const host =
            ctx.req.header('x-forwarded-host') ??
            ctx.req.header('host') ??
            '';
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

        // Tenant itself is never in TENANT_SCOPED_MODELS (it isn't scoped BY a
        // tenant, it IS one), so this lookup passes through withTenantScope's
        // extension unchanged regardless of AsyncLocalStorage context — no
        // chicken-and-egg problem resolving the tenant before it's "in scope".
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
        await runWithTenant(tenant.id, next);
    },
);
