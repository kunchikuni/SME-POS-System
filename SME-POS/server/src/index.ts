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
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { sessionMiddleware, CookieStore } from 'hono-sessions';
import { ZodError } from 'zod';

import type { HonoVars } from './lib/context.js';
import { resolveTenant } from './middleware/resolveTenant.js';
import { requireAuth, requireGuest } from './middleware/auth.js';
import { resolveDevice } from './middleware/resolveDevice.js';
import { ensureSubscribed } from './middleware/ensureSubscribed.js';
import { requireFeature } from './middleware/requireFeature.js';

// ── Route modules ─────────────────────────────────────────────────────────────
import { authRoutes } from './routes/auth.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { productRoutes } from './routes/products.js';
import { categoryRoutes } from './routes/categories.js';
import { staffRoutes } from './routes/staff.js';
import { branchRoutes } from './routes/branches.js';
import { deviceRoutes } from './routes/devices.js';
import { taskRoutes } from './routes/tasks.js';
import { kitchenRoutes } from './routes/kitchen.js';
import { orderRoutes } from './routes/orders.js';
import { transactionRoutes } from './routes/transactions.js';
import { analyticsRoutes } from './routes/analytics.js';
import { billingRoutes } from './routes/billing.js';
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

// ── App setup ─────────────────────────────────────────────────────────────────
const app = new Hono<{ Variables: HonoVars }>();

// Refuse to boot with a missing/default session key in production. The old
// fallback ('change-me-in-production-32chars!') meant a deploy that forgot
// APP_KEY silently ran with a publicly known encryption key — anyone reading
// this repo could mint valid session cookies for any user on any tenant.
const APP_KEY = process.env.APP_KEY;
if (process.env.NODE_ENV === 'production' && (!APP_KEY || APP_KEY.length < 32)) {
  throw new Error('APP_KEY must be set (≥32 chars) in production — refusing to start.');
}

// Global middleware
app.use('*', logger());
app.use('*', secureHeaders());

// CORS: only the tenant domain and its subdomains, plus the Vite/POS dev
// servers. The previous `origin: (origin) => origin` reflected EVERY origin
// with credentials:true — which disables the same-origin policy entirely:
// any website could make credentialed requests to the API from a logged-in
// user's browser AND read the responses (data exfiltration cross-origin).
const ROOT_DOMAIN = process.env.TENANT_DOMAIN ?? 'wivae.test';
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

// ── Static assets (Vite build output) ─────────────────────────────────────────
app.use('/assets/*', serveStatic({ root: '../public' }));
app.use('/pos/assets/*', serveStatic({ root: '../public' }));

// ── POS API routes (device bearer-token auth — stateless) ─────────────────────
// Unprefixed by design (see file docblock) — does not collide with the
// dashboard SPA's client-side routes, and the till's wire contract is
// intentionally left untouched by this change.
//
// resolveDevice is scoped to the exact JSON API paths below rather than
// mounted as `*` middleware on a sub-app hung off `app.route('/', posApi)`.
// That previous shape looked scoped to /sync and /pos, but Hono flattens a
// sub-app's middleware patterns into the parent when the mount prefix is
// '/' — so the `*` became a truly global pattern, matching (and 401'ing)
// EVERY request the server received, including /api/login. Nobody could
// authenticate to the dashboard at all. Enumerating the real POS API paths
// here also keeps the unauthenticated /pos/* PWA shell route (registered
// further down, for hard navigations before a device even has a token)
// from being caught by a /pos/* wildcard.
app.use('/sync/*', resolveDevice);
app.use('/pos/session', resolveDevice);
app.use('/pos/tasks', resolveDevice);
app.use('/pos/tasks/*', resolveDevice);
app.route('/sync', syncRoutes);
app.route('/pos', posRoutes);

// ══════════════════════════════════════════════════════════════════════════
// /api — every JSON endpoint lives under here now
// ══════════════════════════════════════════════════════════════════════════
const api = new Hono<{ Variables: HonoVars }>();

// ── Central routes (root domain — no tenant context) ──────────────────────────
api.route('/', marketingRoutes);
api.route('/', enquiryRoutes);
api.route('/', tenantLookupRoutes);

// ── Tenant routes (subdomain session-cookie auth) ──────────────────────────────
const tenant = new Hono<{ Variables: HonoVars }>();
tenant.use('*', resolveTenant);

// Auth (guest)
tenant.use('/login', requireGuest);
tenant.route('/', authRoutes);

// Webhook — no session, no CSRF (external POST from Paynow)
tenant.route('/billing', billingRoutes);

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
dashboard.route('/tasks', taskRoutes);
dashboard.route('/settings', settingsRoutes);
dashboard.route('/settings', brandingRoutes);
dashboard.route('/settings', accountRoutes);
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

// ── POS PWA shell catch-all ───────────────────────────────────────────────────
// Serves pos/index.html for all /pos/* navigation requests.
// Registered LAST so static asset routes take priority.
app.get('/pos/*', serveStatic({ path: '../public/pos/index.html' }));

// ── Dashboard SPA catch-all ───────────────────────────────────────────────────
// Serves the main Vite SPA for all non-API routes. Because every JSON route
// now lives under /api (or /sync, /pos for the till), this is a genuine
// catch-all: no page path can ever collide with a data endpoint again.
app.get('*', serveStatic({ path: '../public/index.html' }));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3000', 10);

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`🚀 Wivae API running on http://localhost:${PORT}`);
});

export default app;
