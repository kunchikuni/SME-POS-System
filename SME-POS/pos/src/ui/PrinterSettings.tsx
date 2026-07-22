import { useState } from 'react';
import { printerService, type PaperWidth } from '../hardware/printerService';
import { usePrinterStatus } from './usePrinterStatus';

/**
 * Printer pairing + test. Connecting must happen from a user gesture (Web
 * Bluetooth requirement), so this lives behind an explicit button. When BLE
 * isn't available the modal explains why and the till simply uses the browser
 * print fallback. Neutral dark-glass styling — a utility panel reached from
 * both RetailTill and RestaurantTill, not a mode-defining moment.
 */
export function PrinterSettings({ onClose }: { onClose: () => void }) {
    const status = usePrinterStatus();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function connect() {
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            await printerService.connect();
            setMessage('Printer connected.');
        } catch (e) {
            // A user cancelling the chooser is not an error worth shouting about.
            if (e instanceof DOMException && e.name === 'NotFoundError') {
                setError(null);
            } else {
                setError(e instanceof Error ? e.message : 'Could not connect.');
            }
        } finally {
            setBusy(false);
        }
    }

    async function test() {
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            await printerService.testPrint();
            setMessage('Test sent to printer.');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Test failed.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 anim-fade-in" onClick={onClose}>
            <div
                className="w-full max-w-sm rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-sm anim-pop-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">Receipt printer</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors" aria-label="Close">
                        ✕
                    </button>
                </div>

                {!status.supported ? (
                    <p className="mt-4 text-sm text-slate-400">
                        Bluetooth printing needs Chrome or Edge over HTTPS. On this device the till will use the
                        browser’s print dialog instead — receipts still work.
                    </p>
                ) : (
                    <>
                        <div className="mt-4 flex items-center gap-2 text-sm">
              <span
                  className={`h-1.5 w-1.5 rounded-full ${status.connected ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-slate-600'}`}
              />
                            <span className="text-slate-400">
                {status.connected ? `Connected: ${status.name}` : 'No printer connected'}
              </span>
                        </div>

                        <div className="mt-4">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Paper width</p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {(['58mm', '80mm'] as PaperWidth[]).map((w) => (
                                    <button
                                        key={w}
                                        onClick={() => printerService.setPaper(w)}
                                        className={`rounded-xl border py-2 text-sm font-medium transition-all ${
                                            status.paper === w
                                                ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                                                : 'border-white/8 text-slate-400 hover:border-white/16 hover:bg-white/5'
                                        }`}
                                    >
                                        {w}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-5 flex gap-3">
                            {status.connected ? (
                                <>
                                    <button
                                        onClick={test}
                                        disabled={busy}
                                        className="btn-neutral-outline flex-1 rounded-xl py-2.5 font-medium text-slate-200 disabled:opacity-50"
                                    >
                                        Test print
                                    </button>
                                    <button
                                        onClick={() => printerService.disconnect()}
                                        className="flex-1 rounded-xl py-2.5 font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                                    >
                                        Disconnect
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={connect}
                                    disabled={busy}
                                    className="btn-neutral flex-1 rounded-xl py-2.5 font-semibold text-white disabled:opacity-50"
                                >
                                    {busy ? 'Connecting…' : 'Connect printer'}
                                </button>
                            )}
                        </div>
                    </>
                )}

                {message && <p className="mt-3 text-sm text-emerald-400">{message}</p>}
                {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            </div>
        </div>
    );
}
