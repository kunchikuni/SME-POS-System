import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { verifyPin } from '../pos/pin';
import { startShift, type Shift } from '../pos/shift';
import type { StaffMember } from '../types/contract';
import { SyncBadge } from './Shared';

const PIN_LENGTH = 4;

/**
 * Cashier shift login. Staff (with PIN hashes) arrive in the bootstrap snapshot,
 * so this works fully offline. The PIN is verified locally for attribution only.
 */
export function ShiftLogin({ onStart }: { onStart: (shift: Shift) => void }) {
  const staff = useLiveQuery(() => db.staff.toArray(), [], [] as StaffMember[]);
  const [selected, setSelected] = useState<StaffMember | null>(null);

  if (staff.length === 0) {
    return (
      <div className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">No cashiers yet</h1>
          <p className="mt-1 max-w-sm text-slate-500">
            Add a staff member with a till PIN in the dashboard, then sync this device.
          </p>
        </div>
      </div>
    );
  }

  if (selected) {
    return <PinPad staff={selected} onBack={() => setSelected(null)} onStart={onStart} />;
  }

  return (
    <div className="min-h-dvh bg-slate-50 p-6">
      <header className="mx-auto mb-8 flex max-w-md items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Who’s on the till?</h1>
        <SyncBadge />
      </header>
      <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
        {staff.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s)}
            className="rounded-xl bg-white p-5 text-left shadow-sm hover:ring-2 hover:ring-blue-200"
          >
            <div className="text-base font-medium text-slate-900">{s.name}</div>
            <div className="text-sm capitalize text-slate-500">{s.role}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PinPad({
  staff,
  onBack,
  onStart,
}: {
  staff: StaffMember;
  onBack: () => void;
  onStart: (shift: Shift) => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  async function submit(next: string) {
    setChecking(true);
    const ok = await verifyPin(next, staff.pin_hash);
    setChecking(false);
    if (ok) {
      onStart(startShift(staff));
    } else {
      setError(true);
      setPin('');
    }
  }

  function press(digit: string) {
    if (checking || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setError(false);
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-xs text-center">
        <button onClick={onBack} className="mb-6 text-sm text-slate-500 hover:text-slate-700">
          ← Not {staff.name}?
        </button>
        <h1 className="text-lg font-semibold text-slate-900">Enter PIN</h1>

        <div className="my-6 flex justify-center gap-3">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full ${
                i < pin.length ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            />
          ))}
        </div>

        {error && <p className="mb-3 text-sm text-red-600">Incorrect PIN. Try again.</p>}

        <div className="grid grid-cols-3 gap-3">
          {keys.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="rounded-xl bg-white py-4 text-xl font-medium text-slate-900 shadow-sm hover:bg-slate-100"
            >
              {k}
            </button>
          ))}
          <span />
          <button
            onClick={() => press('0')}
            className="rounded-xl bg-white py-4 text-xl font-medium text-slate-900 shadow-sm hover:bg-slate-100"
          >
            0
          </button>
          <button
            onClick={() => {
              setError(false);
              setPin((p) => p.slice(0, -1));
            }}
            className="rounded-xl py-4 text-xl text-slate-500 hover:bg-slate-100"
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}
