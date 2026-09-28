/**
 * Billing routes — port of BillingController, with the real Paynow
 * integration built out (was a 501 stub; see lib/paynow.ts for the client
 * itself and why it's a one-time-payment flow, not native recurring
 * billing -- Paynow's API doesn't have a "charge again next month"
 * primitive).
 *
 * Split into two exports, mounted at two different trust levels in
 * index.ts -- this matters, not just style:
 *   billingRoutes       -> mounted under `dashboard` (requireAuth applied).
 *                           GET /payments and POST /payments/subscribe.
 *   billingWebhookRoutes -> mounted directly on `tenant` (no auth) so
 *                           Paynow's server-to-server callback can reach
 *                           it without a session cookie it could never
 *                           present. Previously both lived in one router
 *                           mounted at the unauthenticated level, which
 *                           meant GET /payments had never actually
 *                           required a login at all (a minor pre-existing
 *                           info-disclosure gap, fixed here as a side
 *                           effect of building the real subscribe flow --
 *                           ctx.get('user') needed real auth applied
 *                           upstream to be safe to call).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { initiateTransaction, verifyHash, isPaidStatus, PaynowNotConfiguredError } from '../lib/paynow.js';
import type { HonoVars } from '../lib/context.js';

export const billingRoutes = new Hono<{ Variables: HonoVars }>();
export const billingWebhookRoutes = new Hono<{ Variables: HonoVars }>();

const ADMIN_ROLES = new Set(['owner', 'manager']);

/**
 * Prices charged server-side, NEVER trusted from the client -- a request
 * body carrying its own "amount" would let anyone pay $0.01 for Premium.
 * Must stay in sync with the marketing site's restored figures
 * (marketing/src/pages/index.astro) -- BYOD $29.99/mo, Standard $199.99
 * one-time, Premium $249 one-time.
 */
const PLAN_PRICES: Record<string, { amountCents: number; recurring: boolean; label: string }> = {
  byod: { amountCents: 2999, recurring: true, label: 'BYOD (monthly)' },
  standard: { amountCents: 19999, recurring: false, label: 'Standard' },
  premium: { amountCents: 24900, recurring: false, label: 'Premium' },
};

/**
 * What the dashboard's Payments page shows — sent with GET /payments so the
 * page can't drift from what's actually charged. (It used to hardcode its
 * own "Growth"/"Scale" plans the server didn't recognise, so choosing one
 * failed at payment.) Feature wording mirrors the marketing page; branch
 * limits mirror entitlementService.ts.
 */
const PLAN_DISPLAY: Record<string, { label: string; branches: number | null; features: string[] }> = {
  byod: {
    label: 'BYOD', branches: 1,
    features: ['1 till', '5 staff accounts', 'Inventory', 'Basic reports', 'Offline first', 'Cloud synchronization', 'Support'],
  },
  standard: {
    label: 'Standard', branches: 3,
    features: ['Everything in BYOD', '10" Android tablet + Bluetooth thermal printer included', 'Implementation training included', 'AI Insights', 'Task management'],
  },
  premium: {
    label: 'Premium', branches: null,
    features: ['Everything in Standard', '12" Android tablet (upgraded)', 'Payroll & HR', 'ZIMRA Fiscalisation included', 'Priority support'],
  },
};

billingRoutes.get('/payments', async (ctx) => {
  const t = ctx.get('tenant');
  const subscription = await db.subscription.findFirst({ where: { tenantId: t.id }, orderBy: { createdAt: 'desc' } });
  const plans = Object.entries(PLAN_PRICES).map(([key, p]) => ({
    key,
    label: PLAN_DISPLAY[key]?.label ?? p.label,
    amountCents: p.amountCents,
    recurring: p.recurring,
    branches: PLAN_DISPLAY[key]?.branches ?? null,
    features: PLAN_DISPLAY[key]?.features ?? [],
  }));
  return ctx.json({ subscription, plan: t.plan, trialEndsAt: t.trialEndsAt, plans });
});

// POST /billing/payments/subscribe -- starts one Paynow payment for the
// chosen plan and returns the URL to send the customer's browser to.
billingRoutes.post('/payments/subscribe', async (ctx) => {
  const user = ctx.get('user');
  if (!ADMIN_ROLES.has(user.role)) return ctx.json({ message: 'Forbidden.' }, 403);

  const tenant = ctx.get('tenant');
  const { plan } = z.object({ plan: z.enum(['byod', 'standard', 'premium']) }).parse(await ctx.req.json());
  const price = PLAN_PRICES[plan];

  // The request's own Host header (not a static env var) is what correctly
  // varies per tenant subdomain -- same reasoning as auth.ts/resolveDevice.ts
  // elsewhere in this app. APP_SCHEME defaults to https for production;
  // override to http only for local dev against a plain http:// tunnel.
  const origin = `${process.env.APP_SCHEME ?? 'https'}://${ctx.req.header('host')}`;
  const reference = `sub_${tenant.id}_${Date.now()}`;

  let init;
  try {
    init = await initiateTransaction({
      reference,
      amount: price.amountCents / 100,
      additionalInfo: `Wivae ${price.label} — ${tenant.name}`,
      authEmail: user.email,
      returnUrl: `${origin}/settings/payments?paynow=return`,
      resultUrl: `${origin}/api/billing/webhook`,
    });
  } catch (err) {
    if (err instanceof PaynowNotConfiguredError) {
      return ctx.json({ message: 'Payments are not configured yet. Contact support.' }, 503);
    }
    console.error('Paynow initiate failed:', err instanceof Error ? err.message : err);
    return ctx.json({ message: 'Could not start payment with Paynow. Please try again shortly.' }, 502);
  }

  // A pending record the webhook will find and flip to active on payment
  // confirmation. "trialing" doubles as "not yet paid" -- there's no
  // separate pending status in this app's vocabulary; see class docblock.
  await db.subscription.create({
    data: {
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      plan,
      status: 'trialing',
      providerRef: reference,
      pollUrl: init.pollUrl,
    },
  });

  return ctx.json({ redirectUrl: init.browserUrl });
});

// POST /billing/webhook -- Paynow's resultUrl target. Mounted unauthenticated
// (see class docblock) -- this is an external POST from Paynow's own
// servers, which can never present a session cookie.
billingWebhookRoutes.post('/webhook', async (ctx) => {
  const body = await ctx.req.parseBody();
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === 'string') fields[k] = v;
  }

  try {
    verifyHash(fields, 'webhook');
  } catch (err) {
    // Do NOT say why in the response -- an attacker probing for the exact
    // validation failure reason is exactly what a generic 400 avoids.
    console.warn('Paynow webhook: hash verification failed', { reference: fields.reference });
    return ctx.json({ message: 'Invalid.' }, 400);
  }

  const subscription = await db.subscription.findFirst({
    where: { providerRef: fields.reference },
  });
  if (!subscription) {
    // Not necessarily an attack -- could be a retry for an old/cleaned-up
    // reference. 200 so Paynow doesn't retry forever on something that will
    // never resolve.
    console.warn('Paynow webhook: no subscription found for reference', fields.reference);
    return ctx.json({ message: 'Unknown reference.' }, 200);
  }

  if (!isPaidStatus(fields.status ?? '')) {
    // Cancelled/created/other non-paid statuses: nothing to activate yet,
    // leave the pending row as-is for a future update on the same reference.
    return ctx.json({ message: 'Acknowledged.' }, 200);
  }

  const price = PLAN_PRICES[subscription.plan];
  // null currentPeriodEnd = never expires (see entitlementService.ts's
  // activeSubscription() -- a set date must be in the future, but a null
  // one is treated as "no expiry check needed"). Exactly right for
  // Standard/Premium's one-time purchase; BYOD gets a real one-month
  // window since it's genuinely a recurring plan.
  const currentPeriodEnd = price?.recurring
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : null;

  await db.$transaction([
    db.subscription.update({
      where: { id: subscription.id },
      data: { status: 'active', currentPeriodEnd },
    }),
    db.tenant.update({
      where: { id: subscription.tenantId },
      data: { plan: subscription.plan },
    }),
  ]);

  return ctx.json({ message: 'Acknowledged.' }, 200);
});
