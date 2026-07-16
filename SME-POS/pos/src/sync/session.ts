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
