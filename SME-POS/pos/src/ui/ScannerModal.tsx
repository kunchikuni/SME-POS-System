import { useEffect, useRef, useState } from 'react';
import {
  isScanSupported,
  ScanUnsupportedError,
  startScan,
  type ScanSession,
} from '../hardware/barcodeScanner';

/**
 * Camera scanning overlay. Opens the rear camera, watches for a barcode, and
 * hands the first code back. The camera is released on unmount as well as on
 * success, so closing the sheet never leaves it running.
 */
export function ScannerModal({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<ScanSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!videoRef.current) return;
      try {
        const session = await startScan(
          videoRef.current,
          (code) => {
            if (!cancelled) onDetected(code);
          },
          () => {
            if (!cancelled) setError('Couldn’t read from the camera. Try again.');
          },
        );
        if (cancelled) {
          session.stop();
          return;
        }
        sessionRef.current = session;
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ScanUnsupportedError) {
          setError(e.message);
        } else if (e instanceof DOMException && e.name === 'NotAllowedError') {
          setError('Camera permission denied. Allow it in your browser settings.');
        } else {
          setError('No camera available on this device.');
        }
      }
    })();

    return () => {
      cancelled = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" onClick={onClose}>
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-semibold text-slate-900">Scan barcode</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>

        {error ? (
          <div className="px-4 pb-6 text-center">
            <p className="text-sm text-slate-600">{error}</p>
            <p className="mt-3 text-xs text-slate-400">
              A USB or Bluetooth barcode scanner still works — it types straight into the search
              box.
            </p>
          </div>
        ) : (
          <div className="relative bg-black">
            <video ref={videoRef} className="aspect-square w-full object-cover" muted />
            {/* Aiming guide */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-24 w-4/5 rounded-lg border-2 border-white/80" />
            </div>
          </div>
        )}

        {!error && (
          <p className="px-4 py-3 text-center text-xs text-slate-500">
            Point the camera at the barcode.
          </p>
        )}
      </div>
    </div>
  );
}

export { isScanSupported };
