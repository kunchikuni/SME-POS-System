/**
 * Auth routes — port of AuthenticatedSessionController + RegisteredTenantController
 * Handles login, logout, and tenant registration.
 *
 * Sessions go through ctx.get('session') (hono-sessions' real API). See
 * middleware/auth.ts for why the previous (ctx.req.raw as any).session
 * pattern authenticated nobody.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db.js';
import { runWithTenant, withoutTenantScope } from '../lib/tenantScope.js';
import { issueHandoff, redeemHandoff } from '../lib/handoff.js';
import { LOGIN_FAILURE_LIMIT, clientIp, loginFailures, rateLimitsDisabled, tooManyRequests } from '../lib/rateLimit.js';
import { BUSINESS_TYPES, BUSINESS_TYPE_KEYS, businessTypeFor } from '../domain/businessTypes.js';
import { accessSummary } from '../domain/billing/entitlementService.js';
import { normalizePhone } from '../lib/phone.js';
import type { HonoVars } from '../lib/context.js';

export const authRoutes = new Hono<{ Variables: HonoVars }>();

// A real bcrypt hash of a random string, used to equalize timing when the
// email doesn't exist: without it, "unknown email" returns measurably faster
// than "wrong password", letting an attacker enumerate which emails have
// accounts on a tenant.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

// POST /login
authRoutes.post('/login', async (ctx) => {
    const body = await ctx.req.json().catch(() => ({}));
    const { email, password } = z
        .object({ email: z.string().email(), password: z.string().min(1) })
        .parse(body);

    const tenant = ctx.get('tenant');

    // Too many wrong passwords for this email from this address → stop before
    // doing any work. Keyed on what was SUBMITTED, not on whether the account
    // exists, so it reveals nothing about which emails have accounts.
    const failKey = `${tenant.id}:${email.toLowerCase()}:${clientIp(ctx)}`;
    if (!rateLimitsDisabled()) {
        const { count, retryAfterSec } = loginFailures.peek(failKey);
        if (count >= LOGIN_FAILURE_LIMIT) return tooManyRequests(ctx, retryAfterSec, 'failed sign-in attempts');
    }

    const user = await db.user.findFirst({
        where: { tenantId: tenant.id, email, deletedAt: null },
    });

    const passwordOk = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);

    if (!user || !user.password || !passwordOk) {
        loginFailures.hit(failKey);
        return ctx.json({ message: 'These credentials do not match our records.' }, 422);
    }

    loginFailures.reset(failKey);
    ctx.get('session').set('userId', user.id);

    return ctx.json({ user: { id: user.id, name: user.name, role: user.role } });
});

// POST /logout
authRoutes.post('/logout', async (ctx) => {
    // deleteSession() invalidates the whole session server-side representation
    // and expires the cookie — strictly better than zeroing one key, which
    // would leave any other session state (and the cookie itself) alive.
    ctx.get('session').deleteSession();
    return ctx.json({ message: 'Logged out.' });
});

// GET /me — current user + tenant for the React auth context
authRoutes.get('/me', async (ctx) => {
    const userId = ctx.get('session')?.get('userId') as string | undefined;
    if (!userId) return ctx.json({ user: null, tenant: null });

    const tenant = ctx.get('tenant');

    // Same cross-tenant check as requireAuth: a session minted on tenant-A
    // must not present itself as logged-in on tenant-B's subdomain.
    // withoutTenantScope() here for the same reason as requireAuth — see its
    // comment in middleware/auth.ts.
    const user = await withoutTenantScope(() =>
        db.user.findFirst({ where: { id: userId, deletedAt: null } }),
    );
    if (!user || user.tenantId !== tenant?.id) return ctx.json({ user: null, tenant: null });

    // Which till modes this business actually runs (per live branch), so the
    // dashboard only shows mode-specific sections that apply — e.g. Kitchen
    // only once some branch is a restaurant.
    const branchModes = await db.branch.findMany({
        where: { tenantId: tenant.id, deletedAt: null },
        select: { mode: true },
        distinct: ['mode'],
    });

    return ctx.json({
        user: { id: user.id, name: user.name, role: user.role, email: user.email || null, phone: user.phone ?? null },
        tenant: tenant ? {
            id: tenant.id,
            name: tenant.name,
            subdomain: tenant.subdomain,
            currency: tenant.currency,
            plan: tenant.plan,
            trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
            // Where the business stands on payment and which features its plan
            // has — /me is outside the payment gate, so this is how the
            // dashboard knows to send a blocked owner to Payments, show a
            // countdown, and lock menu items the plan doesn't include.
            access: accessSummary(tenant as any),
            taxRateBps: tenant.taxRateBps,
            branding: tenant.branding,
            modes: branchModes.map((b: { mode: string }) => b.mode),
        } : null,
    });
});

// Subdomains that must never become a workspace: they're (or will be) the
// product's own hosts, or would impersonate it.
export const RESERVED_SUBDOMAINS = new Set([
    'www', 'app', 'api', 'admin', 'dashboard', 'pos', 'mail', 'email', 'smtp', 'ftp',
    'help', 'support', 'status', 'docs', 'blog', 'static', 'cdn', 'assets', 'billing',
    'login', 'register', 'signup', 'account', 'accounts', 'wivae', 'demo', 'test', 'dev', 'staging',
]);

/** 7 days — what the sign-up page advertises (Register.tsx TRIAL_DAYS). */
export const TRIAL_DAYS = 7;

const WORKSPACE_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/; // no leading/trailing dash

// POST /register — central domain (no tenant)
//
// Creates everything a new business needs to make its first sale: the
// tenant, a default branch already in the right till mode for its business
// type, and the owner — with a dashboard password AND a till PIN, so they
// can sign into the till as soon as it opens. Returns a one-time hand-off
// token (lib/handoff.ts) so the sign-up page can drop them straight into
// their new workspace, signed in.
const registerHandler = async (ctx: Context<{ Variables: HonoVars }>) => {
    const body = await ctx.req.json().catch(() => ({}));
    const data = z
        .object({
            businessName: z.string().trim().min(2, 'Enter your business name.').max(80),
            ownerName: z.string().trim().min(2, 'Enter your name.').max(80),
            subdomain: z.string().trim().toLowerCase().min(3, 'At least 3 characters.').max(30)
                .regex(WORKSPACE_RE, 'Letters, numbers and dashes only (not at the start or end).'),
            businessType: z.enum(BUSINESS_TYPE_KEYS), // domain/businessTypes.ts
            email: z.string().trim().toLowerCase().email('Enter a valid email.'),
            // Optional: where payment reminders are texted. Blank is fine.
            phone: z.string().trim().max(30).optional(),
            password: z.string().min(8, 'At least 8 characters.'),
            pin: z.string().regex(/^\d{4}$/, 'Your till PIN is 4 digits.'),
        })
        .parse(body);

    const phone = data.phone ? normalizePhone(data.phone) : null;
    if (data.phone && !phone) {
        return ctx.json({ message: 'That mobile number does not look right.', errors: { phone: 'Enter a mobile number, e.g. 0771234567.' } }, 422);
    }

    if (RESERVED_SUBDOMAINS.has(data.subdomain)) {
        return ctx.json({ message: 'That workspace name is reserved.', errors: { subdomain: 'That name is reserved — try another.' } }, 422);
    }
    const existing = await db.tenant.findUnique({ where: { subdomain: data.subdomain } });
    if (existing) {
        return ctx.json({ message: 'That workspace name is taken.', errors: { subdomain: 'Already taken — try another.' } }, 422);
    }

    const type = businessTypeFor(data.businessType);
    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const branchId = crypto.randomUUID();
    const [passwordHash, pinHash] = await Promise.all([
        bcrypt.hash(data.password, 12),
        bcrypt.hash(data.pin, 10), // same cost as staff PINs (routes/staff.ts)
    ]);

    // This route runs on the central (bare) domain — resolveTenant never runs
    // here, so there's no tenant in AsyncLocalStorage context yet. Without
    // this wrapper, branch.create/user.create below (both tenant-scoped
    // models) would throw immediately, since db.ts's extension requires a
    // tenant in context by default (see tenantScope.ts). The tenant being
    // created doesn't need to exist as a committed row first — this just sets
    // the in-memory context value that the extension reads; tenantId here is
    // the same UUID already being written explicitly into each row below, so
    // this doesn't change what gets written, only makes the write legal to
    // attempt in the first place.
    await runWithTenant(tenantId, async () =>
        db.$transaction([
            db.tenant.create({
                data: {
                    id: tenantId,
                    name: data.businessName,
                    subdomain: data.subdomain,
                    plan: 'trial',
                    trialEndsAt,
                    // The business type (pharmacy, bottle store…) — see
                    // domain/businessTypes.ts for why it lives in this column.
                    mode: type.key,
                },
            }),
            db.branch.create({
                data: {
                    id: branchId,
                    tenantId,
                    name: 'Main Branch',
                    isDefault: true,
                    // Per-branch mode is which till it opens to — a restaurant
                    // gets the floor plan and kitchen flow from its first sale;
                    // a pharmacy or bottle store gets the retail till.
                    mode: type.tillMode,
                },
            }),
            // Start with the product categories that fit this kind of
            // business, so adding the first product is a pick from a list.
            db.category.createMany({
                data: type.categories.map((name) => ({ id: crypto.randomUUID(), tenantId, name })),
            }),
            db.user.create({
                data: {
                    id: userId,
                    tenantId,
                    branchId,
                    name: data.ownerName,
                    email: data.email,
                    phone,
                    password: passwordHash,
                    pinHash,
                    role: 'owner',
                },
            }),
        ]),
    );

    return ctx.json({ subdomain: data.subdomain, handoff: issueHandoff(userId, tenantId), trialEndsAt }, 201);
};
authRoutes.post('/register', registerHandler);

// POST /welcome — tenant route: trade registration's hand-off token for a session
authRoutes.post('/welcome', async (ctx) => {
    const { token } = z.object({ token: z.string().min(10).max(1000) }).parse(await ctx.req.json().catch(() => ({})));
    const tenant = ctx.get('tenant');

    const userId = redeemHandoff(token, tenant.id);
    if (!userId) {
        return ctx.json({ message: 'This sign-in link has expired. Sign in with your email and password.' }, 401);
    }
    const user = await db.user.findFirst({ where: { id: userId, tenantId: tenant.id, deletedAt: null } });
    if (!user) return ctx.json({ message: 'Account not found.' }, 401);

    ctx.get('session').set('userId', user.id);
    return ctx.json({ user: { id: user.id, name: user.name, role: user.role } });
});


// Separate, slim router exported specifically so /register can be mounted
// centrally (no tenant context) by index.ts, independently of the tenant-
// scoped authRoutes that contains /login and /me. The handler itself is
// defined once on authRoutes above; this re-registers it on a fresh router
// that index.ts can mount without the resolveTenant middleware wrapping it.
export const registerRoutes = new Hono<{ Variables: HonoVars }>();
// The same handler function, not a re-dispatch: the previous
// `authRoutes.fetch(ctx.req.raw)` forwarded the raw request, whose path is
// still /api/register, into a router that only knows /register — so every
// sign-up 404'd before reaching the handler.
registerRoutes.post('/register', registerHandler);

// GET /business-types — central: what the sign-up form offers.
registerRoutes.get('/business-types', (ctx) =>
    ctx.json({ types: BUSINESS_TYPES.map(({ key, label, icon, hint }) => ({ key, label, icon, hint })) }),
);
