import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { MissingPinHashError, verifyPin } from '../pos/pin';
import { startShift, type Shift } from '../pos/shift';
import type { StaffMember } from '../types/contract';
import type { DeviceSession } from '../sync/session';
import { SyncBadge } from './Shared';

const PIN_LENGTH = 4;

/** Mode-aware accent so a restaurant tenant's login screen doesn't flash
 * violet before landing on the orange RestaurantTill — device.tenant.mode
 * is already synced and known before this screen ever renders. */
function accentFor(mode: DeviceSession['tenant']['mode']) {
    return mode === 'restaurant'
        ? {
            glow: 'rgba(234,88,12,0.10)',
            gradient: 'from-orange-500 to-amber-600',
            ring: 'hover:ring-orange-500/30 hover:bg-orange-500/10 hover:shadow-[0_0_20px_rgba(234,88,12,0.15)]',
            dot: 'bg-orange-500 shadow-[0_0_8px_rgba(234,88,12,0.6)]',
        }
        : {
            glow: 'rgba(124,58,237,0.10)',
            gradient: 'from-violet-500 to-indigo-600',
            ring: 'hover:ring-violet-500/30 hover:bg-violet-500/10 hover:shadow-[0_0_20px_rgba(124,58,237,0.15)]',
            dot: 'bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.6)]',
        };
}

/**
 * Cashier shift login. Staff (with PIN hashes) arrive in the bootstrap
 * snapshot, so this works fully offline. Premium dark design with the
 * mode-aware colour palette — matches whichever sub-till (Retail/Restaurant)
 * this shift is about to land on.
 */
export function ShiftLogin({ device, onStart }: { device: DeviceSession; onStart: (shift: Shift) => void }) {
    const staff = useLiveQuery(() => db.staff.toArray(), [], [] as StaffMember[]);
    const [selected, setSelected] = useState<StaffMember | null>(null);
    const accent = accentFor(device.tenant.mode);

    if (staff.length === 0) {
        return (
            <div className="grid min-h-dvh place-items-center pos-bg p-6 text-center relative overflow-hidden">
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{ background: `radial-gradient(ellipse at center, ${accent.glow} 0%, transparent 65%)` }}
                />
                <div className="relative z-10 anim-pop-in">
                    <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-3xl ring-1 ring-white/10">👤</div>
                    <h1 className="text-xl font-bold text-white">No cashiers yet</h1>
                    <p className="mt-2 max-w-xs text-slate-400 text-sm">
                        Add a staff member with a till PIN in the dashboard, then sync this device.
                    </p>
                </div>
            </div>
        );
    }

    if (selected) {
        return <PinPad staff={selected} accent={accent} onBack={() => setSelected(null)} onStart={onStart} />;
    }

    return (
        <div className="min-h-dvh pos-bg flex flex-col">
            {/* Ambient glow */}
            <div
                className="pointer-events-none absolute inset-0"
                style={{ background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${accent.glow} 0%, transparent 70%)` }}
            />

            <header className="relative z-10 mx-auto flex w-full max-w-md items-center justify-between px-6 pt-8 pb-4">
                <div>
                    <h1 className="text-xl font-bold text-white">Who's on the till?</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Select your name to continue</p>
                </div>
                <SyncBadge />
            </header>

            <div className="relative z-10 flex-1 overflow-y-auto px-6 pb-8 dark-scroll">
                <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
                    {staff.map((s, i) => (
                        <button
                            key={s.id}
                            onClick={() => setSelected(s)}
                            className={`group relative flex flex-col items-start rounded-2xl bg-white/5 p-5 text-left ring-1 ring-white/8 transition-all anim-pop-in ${accent.ring}`}
                            style={{ animationDelay: `${i * 60}ms` }}
                        >
                            {/* Avatar initial */}
                            <div className={`mb-3 h-10 w-10 rounded-xl bg-gradient-to-br ${accent.gradient} flex items-center justify-center text-base font-bold text-white shadow-md`}>
                                {s.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="text-sm font-semibold text-white">{s.name}</div>
                            <div className="text-xs capitalize text-slate-500 mt-0.5">{s.role}</div>
                            {/* Arrow hint on hover */}
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                                →
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function PinPad({
                    staff,
                    accent,
                    onBack,
                    onStart,
                }: {
    staff: StaffMember;
    accent: ReturnType<typeof accentFor>;
    onBack: () => void;
    onStart: (shift: Shift) => void;
}) {
    const [pin,      setPin]      = useState('');
    const [error,    setError]    = useState<string | null>(null);
    const [checking, setChecking] = useState(false);

    async function submit(next: string) {
        setChecking(true);
        try {
            const ok = await verifyPin(next, staff.pin_hash);
            if (ok) {
                onStart(startShift(staff));
                return;
            }
            setError('Incorrect PIN. Try again.');
            setPin('');
        } catch (e) {
            if (e instanceof MissingPinHashError) {
                setError('No PIN set up for this cashier. Sync or set their PIN in the dashboard.');
            } else {
                setError('Couldn\u2019t check that PIN. Try again.');
            }
            setPin('');
        } finally {
            setChecking(false);
        }
    }

    function press(digit: string) {
        if (checking || pin.length >= PIN_LENGTH) return;
        const next = pin + digit;
        setError(null);
        setPin(next);
        if (next.length === PIN_LENGTH) void submit(next);
    }

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

    return (
        <div className="grid min-h-dvh place-items-center pos-bg p-6 relative overflow-hidden">
            <div
                className="pointer-events-none absolute inset-0"
                style={{ background: `radial-gradient(ellipse at center, ${accent.glow} 0%, transparent 65%)` }}
            />
            <div className="relative z-10 w-full max-w-xs text-center anim-pop-in">
                {/* Avatar */}
                <div className={`mx-auto mb-4 h-14 w-14 rounded-2xl bg-gradient-to-br ${accent.gradient} flex items-center justify-center text-xl font-bold text-white shadow-lg`}>
                    {staff.name.charAt(0).toUpperCase()}
                </div>

                <button
                    onClick={onBack}
                    className="mb-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                    ← Not {staff.name}?
                </button>
                <h1 className="text-lg font-bold text-white">Enter PIN</h1>

                {/* PIN dots */}
                <div className="my-7 flex justify-center gap-4">
                    {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                        <div
                            key={i}
                            className={`h-3.5 w-3.5 rounded-full transition-all duration-150 ${
                                i < pin.length ? `${accent.dot} scale-110` : 'bg-white/15'
                            }`}
                        />
                    ))}
                </div>

                {error && (
                    <p className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400 ring-1 ring-red-500/20">
                        {error}
                    </p>
                )}

                {/* Numpad */}
                <div className="grid grid-cols-3 gap-3">
                    {keys.map((k) => (
                        <button
                            key={k}
                            onClick={() => press(k)}
                            className="rounded-2xl bg-white/6 py-4 text-xl font-semibold text-white ring-1 ring-white/8 hover:bg-white/10 active:scale-95 transition-all"
                        >
                            {k}
                        </button>
                    ))}
                    <span />
                    <button
                        onClick={() => press('0')}
                        className="rounded-2xl bg-white/6 py-4 text-xl font-semibold text-white ring-1 ring-white/8 hover:bg-white/10 active:scale-95 transition-all"
                    >
                        0
                    </button>
                    <button
                        onClick={() => { setError(null); setPin((p) => p.slice(0, -1)); }}
                        className="rounded-2xl py-4 text-xl text-slate-400 hover:bg-white/6 active:scale-95 transition-all"
                    >
                        ⌫
                    </button>
                </div>
            </div>
        </div>
    );
}
