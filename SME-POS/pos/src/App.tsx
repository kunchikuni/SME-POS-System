import { useEffect, useState } from 'react';
import { getSession, clearSession, type DeviceSession } from './sync/session';
import { endShift, getShift, type Shift } from './pos/shift';
import { getCursor } from './db/database';
import { syncManager } from './sync/syncManager';
import { ApiError } from './sync/apiClient';
import { useSyncStatus } from './ui/useSyncStatus';
import { applyBrandTheme } from './pos/theme';
import { PairDevice } from './ui/PairDevice';
import { ShiftLogin } from './ui/ShiftLogin';
import { Till } from './ui/Till';
import { Splash, UpdateNotice } from './ui/Shared';

/**
 * Boot/phase router for the offline-first till:
 *
 *   no device session → pair the device (needs network once)
 *   not bootstrapped  → fetch the first snapshot; offline here blocks opening
 *   bootstrapped      → start the sync loop
 *   no shift          → cashier PIN login (offline)
 *   ready             → the till
 *
 * Once bootstrapped, every subsequent open works with no network at all.
 */
export function App() {
    // The update notice sits above every screen — pairing, loading, PIN login
    // and the till — so a new version is offered wherever the cashier is.
    return (
        <>
            <AppScreen />
            <UpdateNotice />
        </>
    );
}

function AppScreen() {
    const [device, setDevice] = useState<DeviceSession | null>(getSession());
    const [shift, setShift] = useState<Shift | null>(getShift());
    const [ready, setReady] = useState(false);
    const [bootFailed, setBootFailed] = useState(false);
    const [bootBlocked, setBootBlocked] = useState(false); // 402: the business's subscription has ended
    const syncStatus = useSyncStatus();

    useEffect(() => {
        if (!device) return;

        applyBrandTheme(device.tenant.theme);

        let active = true;
        void (async () => {
            try {
                if ((await getCursor()) === null) {
                    await syncManager.bootstrap(); // first run only; needs a connection
                }
                if (active) setReady(true);
            } catch (err) {
                // 401 = token revoked or device deleted in the dashboard.
                // Wipe the stale session so the user lands on the pairing
                // screen instead of the generic "Couldn't load the catalog"
                // retry loop, which would retry forever with a dead token.
                if (err instanceof ApiError && err.status === 401) {
                    clearSession();
                    if (active) setDevice(null);
                } else if (err instanceof ApiError && err.status === 402) {
                    if (active) setBootBlocked(true);
                } else {
                    if (active) setBootFailed(true);
                }
            }
            syncManager.start();
        })();

        return () => {
            active = false;
            syncManager.stop();
        };
    }, [device]);

    /**
     * If the owner changes a tenant setting (mode, currency, tax rate, theme)
     * while this till is sitting on the pairing/boot/shift-login screens —
     * i.e. before a cashier has started a shift — apply it immediately by
     * reloading, rather than waiting for a manual "Reload" tap on the banner
     * shown once a shift is active (Shared.tsx). This is what makes a mode
     * switch actually reach "the cashier's first till screen": with no shift
     * started yet, there is by definition no in-progress cart to lose, so an
     * unprompted reload here is safe in a way it isn't once someone's mid-sale.
     */
    useEffect(() => {
        if (syncStatus?.settingsChanged && !shift) {
            window.location.reload();
        }
    }, [syncStatus?.settingsChanged, shift]);

    if (!device) return <PairDevice onPaired={setDevice} />;

    if (bootBlocked && !ready) {
        return (
            <Splash
                title="Subscription ended"
                subtitle="This business's subscription has ended, so the till can't finish setting up. Renew it in the dashboard (Settings → Payments), then try again."
                action={{ label: 'Try again', onClick: () => window.location.reload() }}
            />
        );
    }

    if (bootFailed && !ready) {
        return (
            <Splash
                title="Couldn’t load the catalog"
                subtitle="This till needs the internet once to finish setup."
                action={{ label: 'Retry', onClick: () => window.location.reload() }}
            />
        );
    }

    if (!ready) return <Splash title="Starting Wivae POS…" subtitle="Loading catalog." />;

    if (!shift) return <ShiftLogin device={device} onStart={setShift} />;

    return (
        <Till
            device={device}
            shift={shift}
            onEndShift={() => {
                endShift();
                setShift(null);
            }}
        />
    );
}
