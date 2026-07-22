import type { DeviceSession } from '../sync/session';
import type { Shift } from '../pos/shift';
import { RetailTill } from './RetailTill';
import { RestaurantTill } from './RestaurantTill';

/**
 * Mode router. Renders whichever sub-till matches device.tenant.mode — the
 * ONLY source of truth for mode, kept fresh by the background sync (see
 * session.ts / syncManager.ts). No local override: mode gates real backend
 * behavior (kitchen ticket creation in SyncService::applySale), so it can't
 * be allowed to diverge from what the server will actually honor when the
 * sale syncs. See ModePill in Shared.tsx for the fuller reasoning.
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
    if (device.tenant.mode === 'restaurant') {
        return <RestaurantTill device={device} shift={shift} onEndShift={onEndShift} />;
    }

    return <RetailTill device={device} shift={shift} onEndShift={onEndShift} />;
}
