import { getSession } from '../sync/session';
import type { TenantMode } from '../types/contract';

/**
 * Whether this till runs the restaurant flow (tables, kitchen tickets,
 * gratuity) or plain retail. Mode comes from the tenant via /pos/session;
 * sessions saved before Phase 5 have no mode, so we default to retail.
 */
export function tenantMode(): TenantMode {
  return getSession()?.tenant.mode ?? 'retail';
}

export function isRestaurant(): boolean {
  return tenantMode() === 'restaurant';
}
