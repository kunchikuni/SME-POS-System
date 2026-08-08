/** Billing routes — port of BillingController (Paynow subscription billing) */
import { Hono } from 'hono';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const billingRoutes = new Hono<{ Variables: HonoVars }>();
billingRoutes.get('/payments', async (ctx) => {
  const t = ctx.get('tenant');
  const subscription = await db.subscription.findFirst({ where: { tenantId: t.id }, orderBy: { createdAt: 'desc' } });
  return ctx.json({ subscription, plan: t.plan, trialEndsAt: t.trialEndsAt });
});
billingRoutes.post('/payments/subscribe', async (ctx) => {
  // Paynow initiate payment — placeholder for PaynowService port
  return ctx.json({ message: 'Paynow integration — see PaynowService.ts' }, 501);
});
billingRoutes.post('/webhook', async (ctx) => {
  // Paynow webhook — status update, no session/CSRF
  return ctx.json({ message: 'Paynow webhook received.' });
});
