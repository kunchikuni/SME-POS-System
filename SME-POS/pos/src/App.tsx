import { useEffect, useState } from 'react';
import { getSession, type DeviceSession } from './sync/session';
import { endShift, getShift, type Shift } from './pos/shift';
import { getCursor } from './db/database';
import { syncManager } from './sync/syncManager';
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

  useEffect(() => {
    if (!device) return;

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

  if (!shift) return <ShiftLogin onStart={setShift} />;

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
