import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import {
  DEVICE_GRACE_DAYS, MAINTENANCE_GRACE_DAYS, accessState, accessSummary, deviceGraceDays, hasAccess, hasFeature, planKey,
  type TenantForEntitlement,
} from './entitlementService.js';
import { ensureDeviceSubscribed } from '../../middleware/ensureDeviceSubscribed.js';
import { ensureSubscribed } from '../../middleware/ensureSubscribed.js';

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

  describe('Standard and Premium get a fortnight, not three days', () => {
    it('is two weeks for the plans that paid up front, three days for the rest', () => {
      expect(MAINTENANCE_GRACE_DAYS).toBe(14);
      expect(deviceGraceDays('standard')).toBe(14);
      expect(deviceGraceDays('premium')).toBe(14);
      expect(deviceGraceDays('byod')).toBe(DEVICE_GRACE_DAYS);
      expect(deviceGraceDays('trial')).toBe(DEVICE_GRACE_DAYS);
    });

    it('keeps a Standard till syncing for the whole fortnight, then pauses it', () => {
      expect(accessState(paid('standard', -1)).state).toBe('grace');
      expect(accessState(paid('standard', -(DEVICE_GRACE_DAYS + 1))).state).toBe('grace'); // a BYOD till would be paused by now
      expect(accessState(paid('premium', -(MAINTENANCE_GRACE_DAYS - 0.5))).state).toBe('grace');
      expect(accessState(paid('premium', -(MAINTENANCE_GRACE_DAYS + 0.5))).state).toBe('lapsed');
    });

    it('still locks the dashboard at once — only the till gets the runway', () => {
      expect(hasAccess(paid('standard', -1))).toBe(false);
      expect(accessSummary(paid('standard', -1))).toMatchObject({ blocked: true, state: 'grace' });
    });

    it('tells the owner when the tills will stop: a fortnight after the period ended', () => {
      const s = accessSummary(paid('standard', -1));
      const days = (s.graceEndsAt!.getTime() - Date.now()) / DAY;
      expect(days).toBeGreaterThan(12.9);
      expect(days).toBeLessThan(13.1);
    });

    it('leaves BYOD and trials at three days', () => {
      expect(accessState(paid('byod', -(DEVICE_GRACE_DAYS + 0.5))).state).toBe('lapsed');
      expect(accessState(trial(-(DEVICE_GRACE_DAYS + 0.5))).state).toBe('lapsed');
    });
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

describe('accessSummary — what the dashboard is told', () => {
  it('counts down a running trial and unlocks everything', () => {
    const s = accessSummary(trial(3));
    expect(s).toMatchObject({ blocked: false, kind: 'trial', daysLeft: 3, maintenanceFeeCents: null });
    expect(s.features).toEqual({ aiInsights: true, payroll: true, fiscalisation: true });
  });

  it('rounds a part-day up, so the last day still reads "1 day left"', () => {
    expect(accessSummary(trial(0.2)).daysLeft).toBe(1);
  });

  it('counts down Standard/Premium to their next maintenance payment', () => {
    expect(accessSummary(paid('standard', 4))).toMatchObject({ blocked: false, kind: 'maintenance', daysLeft: 4, maintenanceFeeCents: 500 });
    expect(accessSummary(paid('premium', 25))).toMatchObject({ kind: 'maintenance', daysLeft: 25 });
  });

  it('treats BYOD as a monthly plan with no maintenance fee', () => {
    expect(accessSummary(paid('byod', 9))).toMatchObject({ kind: 'monthly', daysLeft: 9, maintenanceFeeCents: null });
  });

  it('has no countdown for a plan with no end date (bought before maintenance began)', () => {
    expect(accessSummary(paid('standard', null))).toMatchObject({ blocked: false, endsAt: null, daysLeft: null });
  });

  it('is blocked once the period ends, and says when its tills stop', () => {
    const s = accessSummary(paid('standard', -1));
    expect(s).toMatchObject({ blocked: true, state: 'grace', daysLeft: null });
    expect(s.graceEndsAt!.getTime()).toBeGreaterThan(Date.now());
    expect(accessSummary(paid('standard', -20))).toMatchObject({ blocked: true, state: 'lapsed' });
  });

  it('reports which gated features each plan has, so the menu can lock the rest', () => {
    expect(accessSummary(paid('byod', 9)).features).toEqual({ aiInsights: false, payroll: false, fiscalisation: false });
    expect(accessSummary(paid('standard', 9)).features).toEqual({ aiInsights: true, payroll: false, fiscalisation: false });
    expect(accessSummary(paid('premium', 9)).features).toEqual({ aiInsights: true, payroll: true, fiscalisation: true });
  });

  it('agrees with hasAccess on whether the dashboard is shut', () => {
    for (const t of [trial(2), trial(-1), paid('byod', 5), paid('byod', -1), paid('standard', null), paid('premium', -3)]) {
      expect(accessSummary(t).blocked).toBe(!hasAccess(t));
    }
  });
});

describe('ensureSubscribed — the dashboard routes', () => {
  const appFor = (tenant: TenantForEntitlement) => {
    const app = new Hono();
    app.use('*', async (c, next) => { (c as any).set('tenant', tenant); await next(); });
    app.use('*', ensureSubscribed as any);
    app.get('/api/products', (c) => c.json({ ok: true }));
    app.get('/api/billing/payments', (c) => c.json({ ok: true }));
    app.post('/api/billing/payments/subscribe', (c) => c.json({ ok: true }));
    app.post('/api/billing/payments/maintenance', (c) => c.json({ ok: true }));
    return app;
  };

  it('lets a paid-up business through', async () => {
    expect((await appFor(paid('standard', 12)).request('/api/products')).status).toBe(200);
  });

  it('blocks an ended trial, with a message that says so', async () => {
    const res = await appFor(trial(-1)).request('/api/products');
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: 'subscription_required', reason: 'trial_ended', message: expect.stringContaining('trial has ended') });
  });

  it('blocks an unpaid maintenance month, and names the $5', async () => {
    const res = await appFor(paid('standard', -2)).request('/api/products');
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: 'subscription_required', reason: 'maintenance_due', message: expect.stringContaining('$5') });
  });

  it('blocks an ended BYOD month without talking about a trial or maintenance', async () => {
    const body: any = await (await appFor(paid('byod', -2)).request('/api/products')).json();
    expect(body.reason).toBe('subscription_ended');
    expect(body.message).not.toMatch(/trial|maintenance/i);
  });

  it('always leaves the payment page and both ways of paying reachable, so a blocked business can pay', async () => {
    const app = appFor(paid('standard', -2));
    expect((await app.request('/api/billing/payments')).status).toBe(200);
    expect((await app.request('/api/billing/payments/subscribe', { method: 'POST' })).status).toBe(200);
    expect((await app.request('/api/billing/payments/maintenance', { method: 'POST' })).status).toBe(200);
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
