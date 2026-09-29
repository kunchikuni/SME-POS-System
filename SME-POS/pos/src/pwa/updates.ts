import { useEffect, useState } from 'react';

/**
 * "A new version of the till is ready" — captured once at startup, read by
 * the one UpdateNotice mounted in App.
 *
 * The service worker reports a waiting update once, early (onNeedRefresh in
 * main.tsx). It used to be broadcast as a DOM event that only the till
 * screens listened for — so if the pairing or PIN screen was showing at that
 * moment, nothing heard it and the notice never appeared that session. Same
 * shape of bug as the install prompt (pwa/installPrompt.ts), same fix: hold
 * the state here from the start.
 *
 * `registerType: 'prompt'` (pos/vite.config.ts) is what makes this a choice:
 * the new version waits until the cashier applies it, because updating
 * reloads the page and the cart lives in React state.
 */

let apply: (() => Promise<void>) | null = null;
const listeners = new Set<() => void>();

/** Called from main.tsx's onNeedRefresh with the function that activates the waiting version and reloads. */
export function markUpdateAvailable(activate: () => Promise<void>): void {
  apply = activate;
  for (const l of listeners) l();
}

/** Activates the waiting version; the page reloads onto it. */
export async function applyUpdate(): Promise<void> {
  await apply?.();
}

export function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(apply !== null);
  useEffect(() => {
    const update = () => setAvailable(apply !== null);
    listeners.add(update);
    update(); // it may have arrived between render and effect
    return () => {
      listeners.delete(update);
    };
  }, []);
  return available;
}
