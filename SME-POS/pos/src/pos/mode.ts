import { getSession } from '../sync/session';
import type { TenantMode } from '../types/contract';

/**
 * Whether this till defaults to the restaurant flow (floor plan, tables,
 * kitchen tickets, gratuity) or plain retail. Comes from the BRANCH via
 * /pos/session — not the tenant. Two branches of the same tenant can be
 * genuinely different business types (a retail store and a restaurant under
 * one owner), so this is scoped to whichever branch this till is actually
 * paired to, not a single tenant-wide value. Sessions saved before this
 * moved off tenant have no branch.mode field at all, so we default to
 * retail rather than crash on an old cached session.
 *
 * This decides what a till OPENS to by default — it is not a hard gate.
 * Any till, regardless of branch mode, can send an individual sale to the
 * kitchen (see route_to_kitchen on SalePayload); this only decides the
 * starting screen.
 */
export function branchMode(): TenantMode {
  return getSession()?.branch.mode ?? 'retail';
}

export function isRestaurant(): boolean {
  return branchMode() === 'restaurant';
}
