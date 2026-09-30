import type { SessionResponse } from '../types/contract';

/**
 * The provisioned device's credential and identity. The bearer token is what
 * authenticates every sync call (ResolveDevice on the server), so it must be
 * available synchronously at boot — hence localStorage rather than IndexedDB.
 *
 * A device is paired once (token entered/scanned during provisioning) and then
 * works offline indefinitely; the token is long-lived by design.
 */

const KEY = 'wivae.pos.session';

export interface DeviceSession {
  token: string;
  device: SessionResponse['device'];
  branch: SessionResponse['branch'];
  tenant: SessionResponse['tenant'];
}

export function getSession(): DeviceSession | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DeviceSession;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return getSession()?.token ?? null;
}

export function saveSession(session: DeviceSession): void {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

/**
 * Updates the stored session's tenant fields (currency, tax rate, theme)
 * AND branch fields (mode) from a fresh /pos/session response, and reports
 * whether anything actually changed.
 *
 * Why this exists: saveSession() was previously only ever called once, at
 * pairing time, in PairDevice.tsx. Everything reading branch.mode
 * (isRestaurant()) or taxRateBps reads that same snapshot forever — an
 * owner switching a branch's mode, or changing the VAT rate, in the
 * dashboard had no way to ever reach an already-paired till. See
 * syncManager.ts, which calls this on every sync cycle.
 *
 * Named mergeSessionInfo, not mergeTenantInfo — mode moved off tenant onto
 * branch (two branches of one tenant can be different business types), so
 * this now merges fields from both objects, not just the tenant's.
 */
export function mergeSessionInfo(
  tenant: SessionResponse['tenant'],
  branch: SessionResponse['branch'],
): boolean {
  const current = getSession();
  if (current === null) return false;

  const changed =
    current.branch.mode !== branch.mode ||
    current.branch.address !== branch.address ||
    current.branch.phone !== branch.phone ||
    current.tenant.currency !== tenant.currency ||
    current.tenant.taxRateBps !== tenant.taxRateBps ||
    JSON.stringify(current.tenant.theme) !== JSON.stringify(tenant.theme) ||
    JSON.stringify(current.tenant.fiscal) !== JSON.stringify(tenant.fiscal);

  if (changed) {
    // Full replacement, not cherry-picked fields — simpler, and correct by
    // construction as more session fields get added later (this has already
    // had to be extended once, for mode; no reason to keep doing that by hand).
    saveSession({ ...current, tenant, branch: { ...current.branch, ...branch } });
  } else if (JSON.stringify(current.branch.kind ?? null) !== JSON.stringify(branch.kind ?? null)) {
    // The branch's display name ("Butchery") is cosmetic: store it so a till
    // paired before it existed picks it up, but don't report a settings
    // change — that raises the "reload" notice, which a label doesn't merit.
    saveSession({ ...current, branch: { ...current.branch, kind: branch.kind } });
  }

  return changed;
}
