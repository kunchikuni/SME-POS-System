import { useState } from 'react';
import { printerService, type PaperWidth } from '../hardware/printerService';
import { usePrinterStatus } from './usePrinterStatus';

/**
 * Printer pairing + test. Connecting must happen from a user gesture (Web
 * Bluetooth requirement), so this lives behind an explicit button. When BLE
 * isn't available the modal explains why and the till simply uses the browser
 * print fallback.
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Receipt printer</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>

        {!status.supported ? (
          <p className="mt-4 text-sm text-slate-500">
            Bluetooth printing needs Chrome or Edge over HTTPS. On this device the till will use the
            browser’s print dialog instead — receipts still work.
          </p>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <span
                className={`h-2 w-2 rounded-full ${status.connected ? 'bg-green-500' : 'bg-slate-300'}`}
              />
              <span className="text-slate-600">
                {status.connected ? `Connected: ${status.name}` : 'No printer connected'}
              </span>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-slate-700">Paper width</p>
              <div className="grid grid-cols-2 gap-2">
                {(['58mm', '80mm'] as PaperWidth[]).map((w) => (
                  <button
                    key={w}
                    onClick={() => printerService.setPaper(w)}
                    className={`rounded-lg border py-2 text-sm font-medium ${
                      status.paper === w
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
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
                    className="flex-1 rounded-lg border border-slate-300 py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Test print
                  </button>
                  <button
                    onClick={() => printerService.disconnect()}
                    className="flex-1 rounded-lg py-2.5 font-medium text-red-600 hover:bg-red-50"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={connect}
                  disabled={busy}
                  className="flex-1 rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy ? 'Connecting…' : 'Connect printer'}
                </button>
              )}
            </div>
          </>
        )}

        {message && <p className="mt-3 text-sm text-green-600">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
