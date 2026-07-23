import { beforeEach, describe, expect, it } from 'vitest';
import { getSession, mergeSessionInfo, saveSession } from './session';

function baseSession() {
  return {
    token: 'demo-token',
    device: { id: 'd1', name: 'Till 1' },
    branch: { id: 'b1', name: 'Main', mode: 'retail' as const },
    tenant: {
      name: 'Demo Store',
      theme: {},
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
 * pairing (PairDevice.tsx). isRestaurant() and every other reader of branch
 * info read that one snapshot forever — an owner switching a branch's mode,
 * or changing the VAT rate, in the dashboard had no way to ever reach an
 * already-paired till. mergeSessionInfo() is what closes that gap; these
 * prove it actually updates storage and correctly reports whether anything
 * changed, which is what syncManager uses to decide whether to notify.
 *
 * Named mergeSessionInfo, not mergeTenantInfo — mode moved off tenant onto
 * branch (two branches of one tenant can be different business types), so
 * it now takes both tenant AND branch and merges fields from each.
 */
describe('mergeSessionInfo', () => {
  it('does nothing and reports false when there is no session yet', () => {
    const changed = mergeSessionInfo(
      { name: 'Demo Store', theme: {}, currency: 'USD', taxRateBps: 1500 },
      { id: 'b1', name: 'Main', mode: 'restaurant' },
    );
    expect(changed).toBe(false);
    expect(getSession()).toBeNull();
  });

  it('reports false and leaves storage untouched when nothing actually changed', () => {
    saveSession(baseSession());
    const changed = mergeSessionInfo(baseSession().tenant, baseSession().branch);
    expect(changed).toBe(false);
    expect(getSession()?.branch.mode).toBe('retail');
  });

  it('detects a branch mode change (the actual bug report) and updates storage', () => {
    saveSession(baseSession());
    const changed = mergeSessionInfo(baseSession().tenant, { ...baseSession().branch, mode: 'restaurant' });
    expect(changed).toBe(true);
    expect(getSession()?.branch.mode).toBe('restaurant');
  });

  it('detects a tax rate change independently of mode', () => {
    saveSession(baseSession());
    const changed = mergeSessionInfo({ ...baseSession().tenant, taxRateBps: 0 }, baseSession().branch);
    expect(changed).toBe(true);
    expect(getSession()?.tenant.taxRateBps).toBe(0);
  });

  it('detects a currency change', () => {
    saveSession(baseSession());
    const changed = mergeSessionInfo({ ...baseSession().tenant, currency: 'ZWL' }, baseSession().branch);
    expect(changed).toBe(true);
    expect(getSession()?.tenant.currency).toBe('ZWL');
  });

  it('detects a theme (branding) change', () => {
    saveSession(baseSession());
    const changed = mergeSessionInfo(
      { ...baseSession().tenant, theme: { primary: '#ff0000' } },
      baseSession().branch,
    );
    expect(changed).toBe(true);
    expect(getSession()?.tenant.theme).toEqual({ primary: '#ff0000' });
  });

  it('preserves the device token, branch id/name, and other fields untouched by a mode-only change', () => {
    saveSession(baseSession());
    mergeSessionInfo(baseSession().tenant, { ...baseSession().branch, mode: 'restaurant' });
    const session = getSession();
    expect(session?.token).toBe('demo-token');
    expect(session?.device.id).toBe('d1');
    expect(session?.branch.id).toBe('b1');
    expect(session?.branch.name).toBe('Main');
  });
});
