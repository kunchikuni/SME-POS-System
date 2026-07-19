/**
 * Camera barcode scanning for the till.
 *
 * Uses the native `BarcodeDetector` API rather than shipping a JS decoder: it's
 * hardware-accelerated, adds no bundle weight, and degrades honestly. Where it
 * isn't available the till still works — keyboard-wedge scanners type straight
 * into the search field, which is how most counter hardware behaves anyway.
 *
 * CONSTRAINTS (same family as the printer spike, docs/spikes/phase-4):
 *  - getUserMedia needs a SECURE CONTEXT (https or localhost). It will not run
 *    on http://demo.wivae.test:8000.
 *  - BarcodeDetector is Chromium-only (Chrome/Edge desktop, Chrome Android).
 *    Safari/iOS has neither, so those devices fall back to wedge scanners or a
 *    native Capacitor scanner later.
 */

// BarcodeDetector isn't in TypeScript's DOM lib yet.
interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

/** Retail-relevant symbologies; QR is included for loyalty/voucher codes. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];

export function isScanSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.BarcodeDetector === 'function' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    window.isSecureContext
  );
}

export class ScanUnsupportedError extends Error {
  constructor() {
    super('Camera scanning needs Chrome or Edge over HTTPS.');
    this.name = 'ScanUnsupportedError';
  }
}

export interface ScanSession {
  stop: () => void;
}

/**
 * Stream the rear camera into `video` and invoke `onDetect` with the first code
 * seen. Returns a handle whose stop() releases the camera — callers MUST call it
 * (an un-released camera keeps the device's indicator on and drains battery).
 */
export async function startScan(
  video: HTMLVideoElement,
  onDetect: (code: string) => void,
  onError?: (error: unknown) => void,
): Promise<ScanSession> {
  if (!isScanSupported()) throw new ScanUnsupportedError();

  const detector = new window.BarcodeDetector!({ formats: FORMATS });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false,
  });

  video.srcObject = stream;
  video.setAttribute('playsinline', 'true'); // iOS won't inline-play without this
  await video.play().catch(() => undefined);

  let stopped = false;
  let frame = 0;

  const release = () => {
    stopped = true;
    if (frame) cancelAnimationFrame(frame);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  const tick = async () => {
    if (stopped) return;
    try {
      const codes = await detector.detect(video);
      const value = codes[0]?.rawValue?.trim();
      if (value) {
        release();
        onDetect(value);
        return;
      }
    } catch (error) {
      // Transient decode failures are normal between frames; only surface a
      // hard failure once and stop, rather than looping on a broken stream.
      if (!stopped) {
        release();
        onError?.(error);
        return;
      }
    }
    frame = requestAnimationFrame(() => void tick());
  };

  frame = requestAnimationFrame(() => void tick());

  return { stop: release };
}

/**
 * Headless single scan for callers without their own preview surface (the
 * DeviceBridge). Creates an offscreen video element, resolves with the first
 * code seen, and always releases the camera — including on timeout, so a caller
 * that walks away can never leave it running.
 *
 * The till's own UI uses startScan() with a visible preview instead; aiming a
 * camera you can't see is not a real workflow.
 */
export async function scanOnce(timeoutMs = 15_000): Promise<string | null> {
  if (!isScanSupported()) return null;

  const video = document.createElement('video');
  video.style.position = 'fixed';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  video.style.width = '1px';
  video.style.height = '1px';
  document.body.appendChild(video);

  let session: ScanSession | null = null;

  const cleanup = () => {
    session?.stop();
    video.remove();
  };

  try {
    return await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);

      void startScan(
        video,
        (code) => {
          clearTimeout(timer);
          resolve(code);
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        },
      )
        .then((s) => {
          session = s;
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(null);
        });
    });
  } finally {
    cleanup();
  }
}
