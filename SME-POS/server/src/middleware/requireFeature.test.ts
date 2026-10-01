import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { requireFeature } from './requireFeature.js';
import type { TenantForEntitlement } from '../domain/billing/entitlementService.js';

const DAY = 86_400_000;
const paid = (plan: string, zimraAddon = false): TenantForEntitlement => ({
  plan,
  trialEndsAt: null,
  subscription: { status: 'active', zimraAddon, currentPeriodEnd: new Date(Date.now() + 20 * DAY) },
});

/**
 * The same composition as server/src/index.ts: each gated feature is a sub-app
 * mounted at '/' on the dashboard, with its gate scoped to its own path. (When
 * the gates were `use('*')`, the payroll gate also ran on /settings/fiscalisation.)
 */
function dashboardFor(tenant: TenantForEntitlement) {
  const ok = new Hono();
  ok.get('/', (c) => c.json({ ok: true }));
  ok.get('/fiscalisation', (c) => c.json({ ok: true }));
  ok.post('/run', (c) => c.json({ ok: true }));

  const dashboard = new Hono();
  dashboard.use('*', async (c, next) => { (c as any).set('tenant', tenant); await next(); });
  dashboard.get('/products', (c) => c.json({ ok: true })); // an ungated page registered earlier
  dashboard.get('/settings/general', (c) => c.json({ ok: true }));

  const aiInsights = new Hono();
  aiInsights.use('/ai-insights/*', requireFeature('ai insights') as any);
  aiInsights.route('/ai-insights', ok);
  dashboard.route('/', aiInsights);

  const payroll = new Hono();
  payroll.use('/payroll/*', requireFeature('payroll') as any);
  payroll.route('/payroll', ok);
  dashboard.route('/', payroll);

  const fiscalisation = new Hono();
  fiscalisation.use('/settings/fiscalisation/*', requireFeature('fiscalisation') as any);
  fiscalisation.route('/settings', ok);
  dashboard.route('/', fiscalisation);

  return dashboard;
}

const hit = async (tenant: TenantForEntitlement, path: string, method = 'GET') => {
  const res = await dashboardFor(tenant).request(path, { method });
  return { status: res.status, body: (await res.json()) as any };
};

describe('feature gates, as mounted on the dashboard', () => {
  it('Standard: AI Insights opens; Payroll and Fiscalisation each name THEMSELVES when refused', async () => {
    expect((await hit(paid('standard'), '/ai-insights')).status).toBe(200);

    const payroll = await hit(paid('standard'), '/payroll');
    expect(payroll.status).toBe(403);
    expect(payroll.body).toMatchObject({ code: 'plan_upgrade_required', feature: 'payroll', plan: 'standard' });

    const fiscal = await hit(paid('standard'), '/settings/fiscalisation');
    expect(fiscal.status).toBe(403);
    expect(fiscal.body.feature).toBe('fiscalisation'); // not 'payroll'
  });

  it('gates every path under a feature, not just its index page', async () => {
    expect((await hit(paid('standard'), '/payroll/run', 'POST')).status).toBe(403);
    expect((await hit(paid('standard'), '/settings/fiscalisation/toggle', 'GET')).status).toBe(403);
  });

  it("the ZIMRA add-on opens Fiscalisation without opening Payroll — the payroll gate no longer blocks it", async () => {
    expect((await hit(paid('standard', true), '/settings/fiscalisation')).status).toBe(200);
    expect((await hit(paid('standard', true), '/payroll')).status).toBe(403);
  });

  it('Premium opens all three', async () => {
    for (const path of ['/ai-insights', '/payroll', '/settings/fiscalisation']) {
      expect((await hit(paid('premium'), path)).status).toBe(200);
    }
  });

  it('BYOD is refused all three, each by its own gate', async () => {
    expect((await hit(paid('byod'), '/ai-insights')).body.feature).toBe('ai insights');
    expect((await hit(paid('byod'), '/payroll')).body.feature).toBe('payroll');
    expect((await hit(paid('byod'), '/settings/fiscalisation')).body.feature).toBe('fiscalisation');
  });

  it('leaves every other page alone, whatever the plan', async () => {
    expect((await hit(paid('byod'), '/products')).status).toBe(200);
    expect((await hit(paid('byod'), '/settings/general')).status).toBe(200);
  });
});
