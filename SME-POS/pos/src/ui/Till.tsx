import type { DeviceSession } from '../sync/session';
import type { Shift } from '../pos/shift';
import { RetailTill } from './RetailTill';
import { RestaurantTill } from './RestaurantTill';

/**
 * Mode router. Renders whichever sub-till matches device.branch.mode — the
 * ONLY source of truth for what this till defaults to, kept fresh by the
 * background sync (see session.ts / syncManager.ts). Scoped to the branch
 * this device is actually paired to, not the tenant — two branches of the
 * same tenant can be genuinely different business types (docs: "Both —
 * multiple locations, and at least one of them is itself hybrid").
 *
 * This decides the STARTING screen only, not a hard architectural gate: the
 * backend's kitchen-ticket creation is keyed off the sale's own
 * route_to_kitchen flag, not branch mode (see SyncService::applySale()).
 * Currently only RestaurantTill's checkout actually sets that flag —
 * RetailTill deliberately doesn't offer a way to route a sale to the
 * kitchen at all. See ModePill in Shared.tsx.
 *
 * Each sub-till (RetailTill / RestaurantTill) is fully self-contained — no
 * shared if/else branching between them.
 */
export function Till({
  device,
  shift,
  onEndShift,
}: {
  device: DeviceSession;
  shift: Shift;
  onEndShift: () => void;
}) {
  if (device.branch.mode === 'restaurant') {
    return <RestaurantTill device={device} shift={shift} onEndShift={onEndShift} />;
  }

  return <RetailTill device={device} shift={shift} onEndShift={onEndShift} />;
}
