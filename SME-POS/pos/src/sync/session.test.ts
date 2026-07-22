import { beforeEach, describe, expect, it } from 'vitest';
import { getSession, mergeTenantInfo, saveSession } from './session';

function baseSession() {
  return {
    token: 'demo-token',
    device: { id: 'd1', name: 'Till 1' },
    branch: { id: 'b1', name: 'Main' },
    tenant: {
      name: 'Demo Store',
      theme: {},
      mode: 'retail' as const,
      currency: 'USD',
      taxRateBps: 1500,
    },
  };
}

beforeEach(() => {
  localStorage.clear();
});

/**
 * Regression: saveSession() was previously only ever called once, at device
 * pairing (PairDevice.tsx). isRestaurant() and every other reader of tenant
 * info read that one snapshot forever — an owner switching Retail/Restaurant,
 * or changing the VAT rate, in the dashboard had no way to ever reach an
 * already-paired till. mergeTenantInfo() is what closes that gap; these
 * prove it actually updates storage and correctly reports whether anything
 * changed, which is what syncManager uses to decide whether to notify.
 */
describe('mergeTenantInfo', () => {
  it('does nothing and reports false when there is no session yet', () => {
    const changed = mergeTenantInfo({
      name: 'Demo Store',
      theme: {},
      mode: 'restaurant',
      currency: 'USD',
      taxRateBps: 1500,
    });
    expect(changed).toBe(false);
    expect(getSession()).toBeNull();
  });

  it('reports false and leaves storage untouched when nothing actually changed', () => {
    saveSession(baseSession());
    const changed = mergeTenantInfo(baseSession().tenant);
    expect(changed).toBe(false);
    expect(getSession()?.tenant.mode).toBe('retail');
  });

  it('detects a mode change (the actual bug report) and updates storage', () => {
    saveSession(baseSession());
    const changed = mergeTenantInfo({ ...baseSession().tenant, mode: 'restaurant' });
    expect(changed).toBe(true);
    expect(getSession()?.tenant.mode).toBe('restaurant');
  });

  it('detects a tax rate change independently of mode', () => {
    saveSession(baseSession());
    const changed = mergeTenantInfo({ ...baseSession().tenant, taxRateBps: 0 });
    expect(changed).toBe(true);
    expect(getSession()?.tenant.taxRateBps).toBe(0);
  });

  it('detects a currency change', () => {
    saveSession(baseSession());
    const changed = mergeTenantInfo({ ...baseSession().tenant, currency: 'ZWL' });
    expect(changed).toBe(true);
    expect(getSession()?.tenant.currency).toBe('ZWL');
  });

  it('detects a theme (branding) change', () => {
    saveSession(baseSession());
    const changed = mergeTenantInfo({ ...baseSession().tenant, theme: { primary: '#ff0000' } });
    expect(changed).toBe(true);
    expect(getSession()?.tenant.theme).toEqual({ primary: '#ff0000' });
  });

  it('preserves the device token and other fields untouched by a tenant-only change', () => {
    saveSession(baseSession());
    mergeTenantInfo({ ...baseSession().tenant, mode: 'restaurant' });
    const session = getSession();
    expect(session?.token).toBe('demo-token');
    expect(session?.device.id).toBe('d1');
    expect(session?.branch.id).toBe('b1');
  });
});
