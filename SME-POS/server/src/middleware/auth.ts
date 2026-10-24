/**
 * Auth middleware — session-cookie authentication for the dashboard.
 * Port of Laravel Fortify + TenantUserProvider.
 *
 * Invariant preserved from the PHP version (ARCHITECTURE.md §7):
 *   - User is loaded WITHOUT a tenant scope (withoutGlobalScopes equivalent)
 *   - Then tenant_id is checked explicitly against ctx.get('tenant').id
 *   - This prevents session replay across tenants (cookie is shared across subdomains)
 *
 * Session access goes through ctx.get('session') — the object hono-sessions
 * actually provides. The previous version read (ctx.req.raw as any).session,
 * which is undefined under hono-sessions: login threw a TypeError and every
 * requireAuth check saw no userId, so the entire dashboard auth layer was
 * non-functional. Verified empirically against the installed package.
 */
import { createMiddleware } from 'hono/factory';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';

/** Require a valid authenticated session. Returns 401 if not logged in. */
export const requireAuth = createMiddleware<{ Variables: HonoVars }>(
  async (ctx, next) => {
    const userId = ctx.get('session')?.get('userId') as string | undefined;

    if (!userId) {
      return ctx.json({ message: 'Unauthenticated.' }, 401);
    }

    // Load user WITHOUT any tenant scope — matches TenantUserProvider behaviour
    const user = await db.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      // Session references a deleted user
      return ctx.json({ message: 'Unauthenticated.' }, 401);
    }

    // Verify the user belongs to the tenant resolved from the request host.
    // This is what stops a session minted on tenant-A from working on tenant-B.
    const tenant = ctx.get('tenant');
    if (user.tenantId !== tenant?.id) {
      return ctx.json({ message: 'Unauthenticated.' }, 401);
    }

    ctx.set('user', user);
    await next();
  },
);

/**
 * Guest gate for /login etc. This is an API, so respond 409 JSON rather than
 * redirecting — a fetch() client follows redirects transparently and would
 * try to JSON.parse the SPA's HTML shell. The SPA's own <RequireGuest>
 * handles the visual redirect.
 */
export const requireGuest = createMiddleware<{ Variables: HonoVars }>(
  async (ctx, next) => {
    if (ctx.get('session')?.get('userId')) {
      return ctx.json({ message: 'Already authenticated.', redirect: '/dashboard' }, 409);
    }
    await next();
  },
);
