/**
 * Wivae — Node.js API Server
 * Hono framework, Postgres via Prisma, session-cookie auth for dashboard,
 * bearer-token auth for the POS sync API.
 *
 * Route topology:
 *   /api/*        — every JSON endpoint (central + tenant + dashboard).
 *                   Deliberately namespaced away from the SPA's client-side
 *                   routes (see note below) — this is the fix for the
 *                   "hard refresh shows raw JSON" bug.
 *   /sync/*, /pos/* — POS device API (bearer token, stateless). Left
 *                   unprefixed: this is a separate PWA build with its own
 *                   client-side routes that never collide with these paths,
 *                   and its wire contract is intentionally left untouched here.
 *
 * ── Why /api ─────────────────────────────────────────────────────────────
 * Previously every dashboard route (e.g. /payroll, /products, /analytics)
 * was registered at the SAME path the React Router SPA uses for its pages.
 * That's harmless for client-side (soft) navigation — React Router
 * intercepts it before a network request happens — but any HARD navigation
 * (refresh, typed URL, bookmark, shared link) sends a real HTTP request,
 * which Hono matches to the API route BEFORE the SPA catch-all at the
 * bottom of this file ever runs. The browser then renders the raw JSON
 * body as page content. This reproduced even for the marketing homepage
 * (GET / on the root domain collided with marketingRoutes' GET /).
 * Prefixing every JSON route with /api removes the collision entirely:
 * nothing under /api is ever a page path, so the SPA catch-all is now a
 * true catch-all for real navigations.
 *
 * NB: resources/js/lib/api.ts's BASE_URL and the one raw fetch('/me') in
 * lib/auth.tsx must point at /api — see the matching frontend patch.
 * NB: Paynow's configured webhook URL needs updating to
 * https://<domain>/api/billing/webhook once that integration goes live —
 * this is an external dashboard setting, not something in this repo.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { sessionMiddleware, CookieStore } from 'hono-sessions';
import { ZodError } from 'zod';

import type { HonoVars } from './lib/context.js';
import { rateLimit } from './lib/rateLimit.js';
import { resolveTenant } from './middleware/resolveTenant.js';
import { requireAuth, requireGuest } from './middleware/auth.js';
import { resolveDevice } from './middleware/resolveDevice.js';
import { ensureSubscribed } from './middleware/ensureSubscribed.js';
import { requireFeature } from './middleware/requireFeature.js';

// ── Route modules ─────────────────────────────────────────────────────────────
import { authRoutes, registerRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { productRoutes } from './routes/products.js';
import { categoryRoutes } from './routes/categories.js';
import { staffRoutes } from './routes/staff.js';
import { customerRoutes } from './routes/customers.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { branchRoutes } from './routes/branches.js';
import { deviceRoutes } from './routes/devices.js';
import { taskRoutes } from './routes/tasks.js';
import { kitchenRoutes } from './routes/kitchen.js';
import { orderRoutes } from './routes/orders.js';
import { transactionRoutes } from './routes/transactions.js';
import { analyticsRoutes } from './routes/analytics.js';
import { billingRoutes, billingWebhookRoutes } from './routes/billing.js';
import { fiscalisationRoutes } from './routes/fiscalisation.js';
import { payrollRoutes } from './routes/payroll.js';
import { brandingRoutes } from './routes/branding.js';
import { settingsRoutes } from './routes/settings.js';
import { accountRoutes } from './routes/account.js';
import { aiInsightsRoutes } from './routes/aiInsights.js';
import { tenantLookupRoutes } from './routes/tenantLookup.js';
import { marketingRoutes } from './routes/marketing.js';
import { enquiryRoutes } from './routes/enquiries.js';
import { importRoutes } from './routes/import.js';
import { importTemplateRoutes } from './routes/importTemplate.js';
import { exportRoutes } from './routes/export.js';
import { barcodeRoutes } from './routes/barcodes.js';
import { syncRoutes } from './routes/sync.js';
import { posRoutes } from './routes/pos.js';

// ── Where the built dashboard and till live ──────────────────────────────────
// Found from THIS FILE's location, not the working directory. serveStatic
// resolves paths against process.cwd(), and the old hard-coded '../public'
// only worked when started from server/ (npm run dev). In the Docker image the
// process starts in /app, '../public' meant /public, and every page, asset and
// manifest returned 404. server/src/index.ts (dev) and server/dist/index.js
// (production) are both two folders below the project root, so '../../public'
// is right for both. PUBLIC_DIR overrides it for unusual layouts.
const PUBLIC_DIR = process.env.PUBLIC_DIR ?? fileURLToPath(new URL('../../public', import.meta.url));
// serveStatic wants a path relative to the working directory.
const PUBLIC_REL = path.relative(process.cwd(), PUBLIC_DIR).split(path.sep).join('/') || '.';

// ── App setup ─────────────────────────────────────────────────────────────────
const app = new Hono<{ Variables: HonoVars }>();

// ── Startup validation ───────────────────────────────────────────────────────
// Fail fast with actionable errors rather than crashing deep inside a DB call
// or serving the wrong data because a required env var was not set.
const APP_KEY = process.env.APP_KEY;
if (process.env.NODE_ENV === 'production') {
    const REQUIRED_ENV: string[] = ['APP_KEY', 'DATABASE_URL', 'TENANT_DOMAIN'];
    const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')} — refusing to start.`);
    }
    if (!APP_KEY || APP_KEY.length < 32) {
        throw new Error('APP_KEY must be set (≥32 chars) in production — refusing to start.');
    }
    // APP_KEY encrypts every session cookie AND signs the sign-up hand-off
    // links, so anyone who knows it can forge a login as any user. The example
    // value shipped in .env.example ("change-me-to-a-32-character-random-
    // string!!") is 43 characters — it sailed through the length check above —
    // so also refuse placeholders and keys that are obviously not random.
    const placeholder = /change[-_ ]?me|dev-only|example|placeholder|your[-_ ]?(key|secret)|secret|password|123456|qwerty/i;
    if (placeholder.test(APP_KEY) || new Set(APP_KEY).size < 12) {
        throw new Error(
            'APP_KEY looks like a placeholder, not a random key — refusing to start. ' +
            "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
        );
    }
}

// Global middleware
app.use('*', logger());
app.use('*', secureHeaders());

// CORS: only the tenant domain and its subdomains, plus the Vite/POS dev
// servers. The previous `origin: (origin) => origin` reflected EVERY origin
// with credentials:true — which disables the same-origin policy entirely:
// any website could make credentialed requests to the API from a logged-in
// user's browser AND read the responses (data exfiltration cross-origin).
const ROOT_DOMAIN = process.env.TENANT_DOMAIN ?? 'localhost';
const DEV_ORIGINS = new Set([
    'http://localhost:5173', // dashboard dev
    'http://localhost:5174', // POS dev
]);
app.use(
    '*',
    cors({
        origin: (origin) => {
            if (!origin) return origin; // same-origin / non-CORS requests
            if (process.env.NODE_ENV !== 'production' && DEV_ORIGINS.has(origin)) return origin;
            try {
                const { hostname, protocol } = new URL(origin);
                const allowed =
                    (hostname === ROOT_DOMAIN || hostname.endsWith('.' + ROOT_DOMAIN)) &&
                    (process.env.NODE_ENV !== 'production' || protocol === 'https:');
                return allowed ? origin : '';
            } catch {
                return '';
            }
        },
        credentials: true,
    }),
);

// Session middleware (cookie-based, Secure in prod)
const store = new CookieStore();
app.use(
    '*',
    sessionMiddleware({
        store,
        encryptionKey: APP_KEY ?? 'dev-only-key-never-used-in-prod!!',
        expireAfterSeconds: 60 * 60 * 24 * 7, // 7 days
        cookieOptions: {
            path: '/',
            domain: process.env.SESSION_DOMAIN,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
        },
    }),
);

// ── Attempt limits on the public endpoints ───────────────────────────────────
// Per client IP (lib/rateLimit.ts — including how the IP is read behind a
// proxy). Registered here, before any route, so they run first. Failed
// sign-ins are additionally counted per email inside the login handler.
// Generous enough that a real person, or a busy shop behind one shared IP,
// never notices; tight enough to make guessing and scripted sign-ups useless.
app.use('/api/login', rateLimit({ name: 'login', windowMs: 15 * 60_000, max: 40, what: 'sign-in attempts', methods: ['POST'] }));
app.use('/api/register', rateLimit({ name: 'register', windowMs: 60 * 60_000, max: 8, what: 'sign-up attempts', methods: ['POST'] }));
app.use('/api/welcome', rateLimit({ name: 'welcome', windowMs: 10 * 60_000, max: 30, what: 'attempts', methods: ['POST'] }));
app.use('/api/enquire', rateLimit({ name: 'enquire', windowMs: 60 * 60_000, max: 6, what: 'enquiries', methods: ['POST'] }));
// Sign-up checks availability as you type (debounced) — allow plenty, but not enumeration at scale.
app.use('/api/tenant-lookup', rateLimit({ name: 'lookup', windowMs: 60_000, max: 60, what: 'lookups', methods: ['GET'] }));

// ── Global error handler ──────────────────────────────────────────────────────
// Previously absent: a Zod .parse() throw or any DB error fell through to
// Hono's default handler — a 500 with the raw error message (internals
// leakage), and validation failures never reached the client as the
// { message, errors } shape useMutation is written to consume.
app.onError((err, ctx) => {
    if (err instanceof ZodError) {
        const errors: Record<string, string> = {};
        for (const issue of err.issues) {
            const key = issue.path.join('.') || '_';
            if (!errors[key]) errors[key] = issue.message;
        }
        return ctx.json({ message: 'The given data was invalid.', errors }, 422);
    }

    // eslint-disable-next-line no-console
    console.error('Unhandled error:', err);
    // Never echo internal error details to the client.
    return ctx.json({ message: 'Something went wrong on our side.' }, 500);
});

// ── Health check ─────────────────────────────────────────────────────────────
// Used by the Docker HEALTHCHECK directive and load balancer probes. Must be
// registered before middleware that adds overhead (session, CSP, etc.).
app.get('/health', (ctx) => ctx.json({ ok: true, ts: new Date().toISOString() }));

// ── Content Security Policy (POS shell only) ──────────────────────────────────
// Protects the POS PWA shell. Scoped to /pos/* because the dashboard SPA
// has different needs (Inertia, SSR props, etc.) and should get its own CSP
// when that's hardened. Policy breakdown:
//   default-src 'self'          — no external resources by default
//   connect-src 'self'          — fetch() only to same origin (sync/session)
//   script-src  'self' 'wasm-unsafe-eval' — Workbox uses WebAssembly in some
//                                browsers; 'strict-dynamic' could replace 'self'
//                                once nonces are threaded through Vite's build
//   style-src 'self' 'unsafe-inline' — Tailwind emits inline styles in dev;
//                                prod build extracts to .css (TODO: split policy)
//   img-src 'self' data: blob:  — barcode scanner canvas data URLs + blob URLs
//   worker-src 'self' blob:     — service worker registration
//   frame-ancestors 'none'      — prevents clickjacking (POS never iframes)
app.use('/pos/*', async (ctx, next) => {
    await next();
    // Only set on HTML responses — assets (js/css/png) don't need it
    const ct = ctx.res.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) {
        ctx.res.headers.set(
            'Content-Security-Policy',
            [
                "default-src 'self'",
                "connect-src 'self'",
                "script-src 'self' 'wasm-unsafe-eval'",
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: blob:",
                "font-src 'self'",
                "worker-src 'self' blob:",
                "frame-ancestors 'none'",
            ].join('; '),
        );
        // Prevent the browser from guessing content type — defence against
        // MIME-type confusion attacks on uploaded product images.
        ctx.res.headers.set('X-Content-Type-Options', 'nosniff');
    }
});

// ── Static assets (Vite build output) ─────────────────────────────────────────
app.use('/assets/*', serveStatic({ root: PUBLIC_REL }));
app.use('/pos/assets/*', serveStatic({ root: PUBLIC_REL }));

// ── POS API routes (device bearer-token auth — stateless) ─────────────────────
// Unprefixed by design (see file docblock) — does not collide with the
// dashboard SPA's client-side routes, and the till's wire contract is
// intentionally left untouched by this change.
//
// CRITICAL, verified through three iterations against the real Hono
// package before landing on this one:
//   1. posApi.use('*', resolveDevice) on a sub-router mounted at app.route('/',
//      posApi) intercepted EVERY request to the whole app, including /api/*
//      registered later — confirmed empirically, this broke every dashboard
//      request (login included) the entire time a real server was run this
//      session. Static checks (tsc, builds) can't catch this; it's purely
//      runtime dispatch order.
//   2. Replacing it with app.use('/pos/*', resolveDevice) fixed /api/* but
//      then incorrectly required a device token for the PWA SHELL itself
//      (the /pos/* catch-all below serving index.html) — which must load
//      in the browser BEFORE the till has ever been provisioned with a
//      token. Also verified empirically.
//   3. Attaching resolveDevice directly to posRoutes/syncRoutes via
//      .use('*', ...) AFTER their own .get()/.post() were already
//      registered did neither: middleware added after the routes it's
//      meant to guard doesn't apply to them in Hono — verified this let
//      real API calls through with NO token at all, a worse regression
//      than the original bug.
// This version — enumerating POS's actual small, stable API surface
// (routes/pos.ts's three endpoints, plus /sync/*) instead of a broad
// prefix — is the one that passed all eight cases: static assets public,
// PWA shell public, every real endpoint blocked without a token and
// working with one, and /api/* reaching its own handlers untouched.
app.use('/pos/session', resolveDevice);
app.use('/pos/tasks', resolveDevice);
app.use('/pos/tasks/*', resolveDevice);
app.use('/sync/*', resolveDevice);
const posApi = new Hono<{ Variables: HonoVars }>();
posApi.route('/sync', syncRoutes);
posApi.route('/pos', posRoutes);
app.route('/', posApi);

// ══════════════════════════════════════════════════════════════════════════
// /api — every JSON endpoint lives under here now
// ══════════════════════════════════════════════════════════════════════════
const api = new Hono<{ Variables: HonoVars }>();

// ── Central routes (root domain — no tenant context) ──────────────────────────
api.route('/', marketingRoutes);
api.route('/', enquiryRoutes);
api.route('/', tenantLookupRoutes);
// /register is a central route — it CREATES a new tenant and must not require
// one. Previously it lived inside the tenant block (under resolveTenant), so
// registration from the marketing site's root domain always failed with a
// tenant-resolution 404. The handler lives in authRoutes but must be
// separately mounted here so it runs without a tenant context.
api.route('/', registerRoutes);

// ── Tenant routes (subdomain session-cookie auth) ──────────────────────────────
const tenant = new Hono<{ Variables: HonoVars }>();
tenant.use('*', resolveTenant);

// Auth (guest)
tenant.use('/login', requireGuest);
tenant.route('/', authRoutes);

// Paynow webhook — no session, no CSRF (external POST from Paynow's own
// servers, which can never present a session cookie). See billing.ts's
// docblock for why this is a separate router from the payments endpoints.
tenant.route('/billing', billingWebhookRoutes);

// All authenticated + subscribed routes
const dashboard = new Hono<{ Variables: HonoVars }>();
dashboard.use('*', requireAuth);
dashboard.use('*', ensureSubscribed);

dashboard.route('/dashboard', dashboardRoutes);
dashboard.route('/analytics', analyticsRoutes);
dashboard.route('/products', productRoutes);
dashboard.route('/products', importRoutes);
dashboard.route('/products', importTemplateRoutes);
dashboard.route('/products', exportRoutes);
dashboard.route('/products', barcodeRoutes);
dashboard.route('/categories', categoryRoutes);
dashboard.route('/devices', deviceRoutes);
dashboard.route('/kitchen', kitchenRoutes);
dashboard.route('/orders', orderRoutes);
dashboard.route('/transactions', transactionRoutes);
dashboard.route('/branches', branchRoutes);
dashboard.route('/staff', staffRoutes);
dashboard.route('/customers', customerRoutes);
dashboard.route('/onboarding', onboardingRoutes);
dashboard.route('/tasks', taskRoutes);
dashboard.route('/settings', settingsRoutes);
dashboard.route('/settings', brandingRoutes);
dashboard.route('/settings', accountRoutes);
dashboard.route('/billing', billingRoutes);
// NOTE: payroll and fiscalisation are intentionally NOT mounted here.
// They were previously double-registered — once here (unguarded) and once
// below behind requireFeature(). In Hono, the FIRST matching route wins, so
// that unguarded mount made the feature gate a complete no-op: any tenant,
// on any plan, had full access regardless of subscription. Confirmed by
// direct test against this Hono version. Each now has exactly ONE mount,
// below, behind its gate.

// Feature-gated sub-routes — each route is now mounted exactly once.
const aiInsights = new Hono<{ Variables: HonoVars }>();
aiInsights.use('*', requireFeature('ai insights'));
aiInsights.route('/ai-insights', aiInsightsRoutes);
dashboard.route('/', aiInsights);

const payroll = new Hono<{ Variables: HonoVars }>();
payroll.use('*', requireFeature('payroll'));
payroll.route('/payroll', payrollRoutes);
dashboard.route('/', payroll);

const fiscalisation = new Hono<{ Variables: HonoVars }>();
fiscalisation.use('*', requireFeature('fiscalisation'));
fiscalisation.route('/settings', fiscalisationRoutes);
dashboard.route('/', fiscalisation);

tenant.route('/', dashboard);
api.route('/', tenant);

app.route('/api', api);

// ── Installable-app files ─────────────────────────────────────────────────────
// The two catch-alls below answer EVERY other path with an HTML shell — which
// used to include the till's manifest, its service worker and its icons, so
// in production the till was never installable (the browser got HTML for
// its manifest) and its offline service worker never registered. These are
// served as the real files, from an explicit list rather than all of
// the whole public folder, so nothing else that lands in the build folder is exposed.
for (const filePath of [
  '/manifest.webmanifest', '/icons/*', '/favicon.svg', '/favicon.ico', '/apple-touch-icon.png', '/robots.txt',
  '/pos/manifest.webmanifest', '/pos/sw.js', '/pos/workbox-*', '/pos/registerSW.js', '/pos/icons/*',
  '/pos/screenshots/*', '/pos/offline.html', '/pos/favicon.svg', '/pos/favicon.ico',
]) {
  app.get(filePath, serveStatic({ root: PUBLIC_REL }));
}

// ── POS PWA shell catch-all ───────────────────────────────────────────────────
// Serves pos/index.html for all /pos/* navigation requests.
// Registered LAST so static asset routes take priority.
app.get('/pos/*', serveStatic({ path: `${PUBLIC_REL}/pos/index.html` }));

// ── Dashboard SPA catch-all ───────────────────────────────────────────────────
// Serves the main Vite SPA for all non-API routes. Because every JSON route
// now lives under /api (or /sync, /pos for the till), this is a genuine
// catch-all: no page path can ever collide with a data endpoint again.
app.get('*', serveStatic({ path: `${PUBLIC_REL}/index.html` }));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3000', 10);

serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`🚀 Wivae API running on http://localhost:${PORT}`);
});

export default app;
