import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import {
  DEVICE_GRACE_DAYS, accessState, hasAccess, hasFeature, planKey, type TenantForEntitlement,
} from './entitlementService.js';
import { ensureDeviceSubscribed } from '../../middleware/ensureDeviceSubscribed.js';

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY);

const trial = (endsInDays: number): TenantForEntitlement => ({ plan: 'trial', trialEndsAt: at(endsInDays), subscription: null });
const paid = (plan: string, periodEndsInDays: number | null, zimraAddon = false): TenantForEntitlement => ({
  plan,
  trialEndsAt: null,
  subscription: { status: 'active', zimraAddon, currentPeriodEnd: periodEndsInDays === null ? null : at(periodEndsInDays) },
});

describe('plan features', () => {
  it('AI Insights is a Standard feature (and Premium), not BYOD', () => {
    expect(hasFeature(paid('standard', null), 'ai insights')).toBe(true);
    expect(hasFeature(paid('premium', null), 'ai insights')).toBe(true);
    expect(hasFeature(paid('byod', 20), 'ai insights')).toBe(false);
  });

  it('Payroll and Fiscalisation stay Premium-only (Fiscalisation also opens with the ZIMRA add-on)', () => {
    expect(hasFeature(paid('standard', null), 'payroll')).toBe(false);
    expect(hasFeature(paid('premium', null), 'payroll')).toBe(true);
    expect(hasFeature(paid('standard', null), 'fiscalisation')).toBe(false);
    expect(hasFeature(paid('standard', null, true), 'fiscalisation')).toBe(true);
    expect(hasFeature(paid('premium', null), 'fiscalisation')).toBe(true);
  });

  it('a running trial gets everything; a finished one gets nothing', () => {
    expect(hasFeature(trial(3), 'ai insights')).toBe(true);
    expect(hasFeature(trial(3), 'payroll')).toBe(true);
    expect(hasFeature(trial(-1), 'ai insights')).toBe(false);
    expect(hasFeature(trial(-1), 'payroll')).toBe(false);
    expect(planKey(trial(-1))).toBe('trial'); // not 'premium'
    expect(planKey(trial(3))).toBe('premium');
  });
});

describe('accessState — where a business stands, for its tills', () => {
  it('is active during a trial and for a paid plan', () => {
    expect(accessState(trial(2)).state).toBe('active');
    expect(accessState(paid('byod', 12)).state).toBe('active');
    expect(accessState(paid('standard', null)).state).toBe('active'); // one-time purchase never expires
  });

  it(`gives a trial that just ended ${DEVICE_GRACE_DAYS} days of grace, then pauses`, () => {
    const justEnded = accessState(trial(-1));
    expect(justEnded.state).toBe('grace');
    expect(justEnded.graceEndsAt!.getTime()).toBeGreaterThan(Date.now());

    expect(accessState(trial(-(DEVICE_GRACE_DAYS - 0.5))).state).toBe('grace');
    expect(accessState(trial(-(DEVICE_GRACE_DAYS + 0.5))).state).toBe('lapsed');
  });

  it('treats a monthly plan that ran out the same way', () => {
    expect(accessState(paid('byod', -1)).state).toBe('grace');
    expect(accessState(paid('byod', -10)).state).toBe('lapsed');
  });

  it('pauses at once when there is no end date to count a grace period from', () => {
    // A paid plan with no subscription on record (e.g. set by hand), and a trial with no date.
    expect(accessState({ plan: 'standard', trialEndsAt: null, subscription: null })).toEqual({ state: 'lapsed', graceEndsAt: null });
    expect(accessState({ plan: 'trial', trialEndsAt: null, subscription: null }).state).toBe('lapsed');
  });

  it('agrees with hasAccess: active exactly when the dashboard is open', () => {
    for (const t of [trial(2), trial(-1), trial(-9), paid('byod', 5), paid('byod', -1), paid('standard', null)]) {
      expect(hasAccess(t)).toBe(accessState(t).state === 'active');
    }
  });
});

describe('ensureDeviceSubscribed — the till routes', () => {
  /** A tiny app: sets the tenant like resolveDevice would, then the guard, then a route. */
  const appFor = (tenant: TenantForEntitlement | null) => {
    const app = new Hono();
    app.use('*', async (c, next) => { (c as any).set('tenant', tenant); await next(); });
    app.use('*', ensureDeviceSubscribed as any);
    app.get('/sync/pull', (c) => c.json({ ok: true }));
    return app;
  };

  it('lets an active business through', async () => {
    expect((await appFor(paid('standard', null)).request('/sync/pull')).status).toBe(200);
    expect((await appFor(trial(4)).request('/sync/pull')).status).toBe(200);
  });

  it('lets a business in its grace period through', async () => {
    expect((await appFor(trial(-1)).request('/sync/pull')).status).toBe(200);
  });

  it('answers 402 with a stable code once the grace period is over', async () => {
    const res = await appFor(trial(-30)).request('/sync/pull');
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: 'subscription_required' });
  });

  it('does not block when no tenant was resolved (resolveDevice already refused that request)', async () => {
    expect((await appFor(null).request('/sync/pull')).status).toBe(200);
  });
});
