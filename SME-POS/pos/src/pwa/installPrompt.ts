import { useEffect, useState } from 'react';

/**
 * App-wide capture of the browser's install offer.
 *
 * `beforeinstallprompt` fires ONCE per page load, early — usually before the
 * cashier is anywhere near the till screen. InstallAppButton used to attach
 * its own listener on mount, and it only mounted inside the till (after
 * pairing + PIN), so on most loads the event had already fired and been lost,
 * and the button fell back to the manual "look for the icon" instructions
 * even on browsers that support a one-tap install.
 *
 * `startInstallCapture()` runs from main.tsx before React renders, holds the
 * event, and every screen (pairing, PIN login, till) reads it through
 * `useInstallState()`.
 */

export interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface InstallState {
    /** Running as the installed app — nothing to offer. */
    standalone: boolean;
    /** The browser offered a one-tap install (Chromium/Android/desktop Edge+Chrome). */
    canPrompt: boolean;
    /** iPhone/iPad: install is manual only, via Share → Add to Home Screen. */
    ios: boolean;
    /** Opened via the marketing site's "Install the till app" link (?install=1). */
    requested: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify(): void {
    for (const l of listeners) l();
}

function isStandalone(): boolean {
    return (
        installed ||
        window.matchMedia?.('(display-mode: standalone)').matches === true ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
}

export function startInstallCapture(): void {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); // keep it for our own button instead of the mini-infobar
        deferred = e as BeforeInstallPromptEvent;
        notify();
    });
    window.addEventListener('appinstalled', () => {
        installed = true;
        deferred = null;
        notify();
    });
}

function snapshot(): InstallState {
    return {
        standalone: isStandalone(),
        canPrompt: deferred !== null,
        ios: /iphone|ipad|ipod/i.test(window.navigator.userAgent),
        requested: new URLSearchParams(window.location.search).get('install') === '1',
    };
}

export function useInstallState(): InstallState {
    const [state, setState] = useState<InstallState>(snapshot);
    useEffect(() => {
        const update = () => setState(snapshot());
        listeners.add(update);
        update(); // the event may have fired between render and effect
        return () => {
            listeners.delete(update);
        };
    }, []);
    return state;
}

/**
 * Shows the native install dialog. Must be called from a click handler
 * (browsers require a user gesture). Returns false when there's no native
 * offer to show, so the caller falls back to manual instructions.
 */
export async function promptInstall(): Promise<boolean> {
    if (!deferred) return false;
    const event = deferred;
    await event.prompt();
    const { outcome } = await event.userChoice;
    deferred = null; // an offer can only be used once, whatever the outcome
    if (outcome === 'accepted') installed = true;
    notify();
    return true;
}
