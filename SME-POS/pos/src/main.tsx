import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyStoredTheme } from './pos/appTheme';
import { startInstallCapture } from './pwa/installPrompt';

// Must run before the first paint — this is what actually fixes the bug
// where a light-mode user reloaded into a dark-looking page until their
// first click. getAppTheme()/setAppTheme() alone don't touch the DOM; this
// call is the only thing that sets data-theme on <html> before React (and
// every CSS rule scoped to [data-theme="light"]) ever renders a frame.
applyStoredTheme();

// Before React renders: beforeinstallprompt fires once, early, and is lost if
// nothing is listening yet (see pwa/installPrompt.ts).
startInstallCapture();

/**
 * Controlled SW update flow.
 *
 * Previously `registerSW({ immediate: true })` — that activates the new SW
 * the instant it installs, which can silently reload the page mid-sale and
 * lose the cashier's in-progress cart (React state, not persisted).
 *
 * Instead: `registerType: 'prompt'` in vite.config.ts keeps the new SW in
 * the `waiting` state. Here we emit custom DOM events so the
 * UpdateAvailableBanner (Shared.tsx) can surface a dismissible notice. The
 * cashier taps "Update now" at a safe moment; the banner calls `updateSW()`
 * which skips waiting, activates the new SW, and reloads.
 *
 * onOfflineReady: the SW has precached the shell — the till can now cold-
 * start with no network. We emit a brief informational event (the banner
 * shows once and auto-dismisses after 4 s, since there's nothing to lose).
 */
const updateSW = registerSW({
    onNeedRefresh() {
        window.dispatchEvent(new CustomEvent('pwa:update-available', { detail: { updateSW } }));
    },
    onOfflineReady() {
        window.dispatchEvent(new CustomEvent('pwa:offline-ready'));
    },
    onRegisteredSW(swUrl, registration) {
        // Poll for updates every 60 minutes while the tab is open, so a
        // long-running cashier session doesn't miss a critical update for hours.
        if (registration) {
            setInterval(() => {
                void registration.update();
            }, 60 * 60 * 1000);
        }
        if (import.meta.env.DEV) {
            console.debug('[SW] Registered:', swUrl);
        }
    },
});

const root = document.getElementById('app');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}

