import { useEffect, useState } from 'react';
import { getSession, type DeviceSession } from './sync/session';
import { endShift, getShift, type Shift } from './pos/shift';
import { getCursor } from './db/database';
import { syncManager } from './sync/syncManager';
import { useSyncStatus } from './ui/useSyncStatus';
import { applyBrandTheme } from './pos/theme';
import { PairDevice } from './ui/PairDevice';
import { ShiftLogin } from './ui/ShiftLogin';
import { Till } from './ui/Till';
import { Splash } from './ui/Shared';

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
    const [device, setDevice] = useState<DeviceSession | null>(getSession());
    const [shift, setShift] = useState<Shift | null>(getShift());
    const [ready, setReady] = useState(false);
    const [bootFailed, setBootFailed] = useState(false);
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
            } catch {
                if (active) setBootFailed(true);
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
