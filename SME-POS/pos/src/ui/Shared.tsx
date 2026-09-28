import { useState, useEffect, useCallback, useRef } from 'react';
import { useSyncStatus } from './useSyncStatus';
import { syncManager } from '../sync/syncManager';
import type { TenantMode } from '../types/contract';
import { getAppTheme, setAppTheme, type AppTheme } from '../pos/appTheme';
import { promptInstall, useInstallState } from '../pwa/installPrompt';

/** Live connectivity + outbox indicator, shown in the till header. */
export function SyncBadge() {
    const status = useSyncStatus();
    if (!status) return null;

    const dot = status.online ? 'bg-emerald-400' : 'bg-amber-400';
    return (
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${dot} ${status.online ? 'shadow-[0_0_6px_#34d399]' : ''}`} />
            <span>{status.online ? 'Online' : 'Offline'}</span>
            {status.syncing && <span className="text-slate-500">· syncing</span>}
            {status.pending > 0 && (
                <span className="text-amber-500">· {status.pending} unsynced</span>
            )}
        </div>
    );
}

/**
 * Tells the cashier the owner changed a store setting (mode, currency, tax
 * rate, or branding) since this till was paired or last reloaded.
 */
export function SettingsChangedBanner() {
    const status = useSyncStatus();
    const [dismissed, setDismissed] = useState(false);

    if (!status?.settingsChanged || dismissed) return null;

    return (
        <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-300 backdrop-blur-sm">
            <span>Store settings have changed. Reload to apply them.</span>
            <div className="flex shrink-0 items-center gap-3">
                <button onClick={() => window.location.reload()} className="font-semibold underline underline-offset-2">
                    Reload
                </button>
                <button onClick={() => setDismissed(true)} className="text-amber-500 hover:text-amber-300">
                    Not now
                </button>
            </div>
        </div>
    );
}

/**
 * Surfaces a new PWA version without silently reloading mid-sale.
 *
 * Listens for the `pwa:update-available` DOM event emitted by main.tsx when
 * the service worker has a waiting update. The cashier taps "Update now" at
 * a safe moment; calling `updateSW()` skips waiting and reloads. Using the
 * same dismissible pattern as SettingsChangedBanner so the UX is consistent.
 *
 * This is why `registerType: 'prompt'` exists in vite.config.ts — `autoUpdate`
 * would activate the SW immediately, losing the React cart state.
 */
export function UpdateAvailableBanner() {
    const [updateSW, setUpdateSW] = useState<(() => Promise<void>) | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        function onUpdateAvailable(e: Event) {
            const detail = (e as CustomEvent<{ updateSW: () => Promise<void> }>).detail;
            setUpdateSW(() => detail.updateSW);
        }
        window.addEventListener('pwa:update-available', onUpdateAvailable);
        return () => window.removeEventListener('pwa:update-available', onUpdateAvailable);
    }, []);

    const handleUpdate = useCallback(() => {
        void updateSW?.();
    }, [updateSW]);

    if (!updateSW || dismissed) return null;

    return (
        <div className="flex items-center justify-between gap-3 border-b border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm text-blue-300 backdrop-blur-sm">
            <span>⬆ A new version of Wivae POS is ready.</span>
            <div className="flex shrink-0 items-center gap-3">
                <button onClick={handleUpdate} className="font-semibold underline underline-offset-2">
                    Update now
                </button>
                <button onClick={() => setDismissed(true)} className="text-blue-500 hover:text-blue-300">
                    Later
                </button>
            </div>
        </div>
    );
}

/**
 * Brief toast confirming the app shell has been cached and the till can now
 * cold-start with no network. Auto-dismisses after 4 s — there is no action
 * to take, just a useful confidence signal for a newly provisioned device.
 */
export function OfflineReadyToast() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        function onOfflineReady() {
            setVisible(true);
            setTimeout(() => setVisible(false), 4000);
        }
        window.addEventListener('pwa:offline-ready', onOfflineReady);
        return () => window.removeEventListener('pwa:offline-ready', onOfflineReady);
    }, []);

    if (!visible) return null;

    return (
        <div
            aria-live="polite"
            className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 shadow-lg backdrop-blur-sm"
        >
            ✓ Wivae POS is ready to work offline
        </div>
    );
}

/**
 * Warns the cashier when one or more outbox entries have failed 5+ times —
 * a "stuck sale" that will never auto-retry via the normal backoff schedule.
 * Prompts them to contact support rather than silently losing the data.
 */
export function OutboxStuckBanner() {
    const status = useSyncStatus();
    const [dismissed, setDismissed] = useState(false);

    const stuck = status?.outboxStuck === true;

    if (!stuck || dismissed) return null;

    return (
        <div className="flex items-center justify-between gap-3 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300 backdrop-blur-sm">
            <span>⚠ One or more sales could not sync after several attempts. Contact support.</span>
            <div className="flex shrink-0 items-center gap-3">
                <button
                    onClick={() => void syncManager.retryNow()}
                    disabled={status?.syncing}
                    className="font-medium text-red-200 hover:text-white disabled:opacity-50"
                >
                    {status?.syncing ? 'Retrying…' : 'Retry now'}
                </button>
                <button onClick={() => setDismissed(true)} className="text-red-500 hover:text-red-300">
                    Dismiss
                </button>
            </div>
        </div>
    );
}

/**
 * Brief confirmation after a background sync actually clears something out
 * of the outbox — "3 sales synced". Auto-dismisses after 4s, same as
 * OfflineReadyToast: this is passive reassurance for a cashier who's been
 * offline for a while and wants to know it's catching up, not a warning
 * needing action, so it shouldn't linger or need a dismiss button the way
 * OutboxStuckBanner does.
 *
 * Compares lastSyncBatch's timestamp against the last one this component
 * has already shown, rather than just checking "is count > 0" — status
 * objects re-render on every sync tick (pending count, online state, etc.),
 * and without that comparison this would re-show the same old batch's
 * count on every unrelated status update after the toast had already
 * finished its first appearance.
 */
export function SyncedToast() {
    const status = useSyncStatus();
    const [visible, setVisible] = useState(false);
    const [count, setCount] = useState(0);
    const shownAtRef = useRef<string | null>(null);

    useEffect(() => {
        const batch = status?.lastSyncBatch;
        if (!batch || batch.at === shownAtRef.current) return;

        shownAtRef.current = batch.at;
        setCount(batch.count);
        setVisible(true);
        const timer = setTimeout(() => setVisible(false), 4000);
        return () => clearTimeout(timer);
    }, [status?.lastSyncBatch]);

    if (!visible) return null;

    return (
        <div
            aria-live="polite"
            className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 shadow-lg backdrop-blur-sm"
        >
            ✓ {count} {count === 1 ? 'sale' : 'sales'} synced
        </div>
    );
}


export function Splash({
                           title,
                           subtitle,
                           action,
                       }: {
    title: string;
    subtitle?: string;
    action?: { label: string; onClick: () => void };
}) {
    return (
        <div className="grid min-h-dvh place-items-center pos-bg p-6 text-center relative overflow-hidden">
            {/* Soft radial glow behind content */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.12)_0%,transparent_70%)]" />
            <div className="relative z-10 anim-pop-in">
                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-3xl ring-1 ring-white/10">
                    🛒
                </div>
                <h1 className="text-2xl font-bold text-white">{title}</h1>
                {subtitle && <p className="mt-2 text-slate-400">{subtitle}</p>}
                {action && (
                    <button
                        onClick={action.onClick}
                        className="btn-retail mt-8 rounded-xl px-6 py-3 font-semibold text-white"
                    >
                        {action.label}
                    </button>
                )}
            </div>
        </div>
    );
}

/**
 * Sun / moon toggle switch matching the dashboard header design. Persisted to
 * localStorage and syncs with html[data-theme]. The INITIAL data-theme
 * attribute is set by applyStoredTheme() in main.tsx, before React ever
 * renders — this component's own useState just mirrors that same source so
 * the toggle's visual state agrees with what's already on screen. If
 * main.tsx ever stops calling applyStoredTheme() first, this toggle would
 * still LOOK right on mount while the page underneath is actually still
 * showing the other theme, self-correcting only on the first click.
 */
export function ThemeToggle() {
    const [theme, setTheme] = useState<AppTheme>(getAppTheme);

    function toggle() {
        const next: AppTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        setAppTheme(next);
    }

    const isDark = theme === 'dark';

    return (
        <button
            type="button"
            onClick={toggle}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none ${
                isDark
                    ? 'bg-slate-700/80 ring-1 ring-white/15 hover:bg-slate-700'
                    : 'bg-slate-200 border border-slate-300/80 hover:bg-slate-300/80'
            }`}
        >
            <span className="sr-only">Toggle theme</span>
            <span
                className={`pointer-events-none grid h-6 w-6 place-items-center rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                    isDark ? 'translate-x-5' : 'translate-x-0'
                }`}
            >
        {isDark ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
        ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
        )}
      </span>
        </button>
    );
}

/**
 * Read-only mode indicator — NOT a control. Mode is a tenant-wide setting
 * (docs/ARCHITECTURE.md: "a tenant setting, not a fork") that gates real
 * server behavior — SyncService only creates a kitchen ticket when the
 * tenant's actual database column says restaurant, regardless of what the
 * till showed while the sale was being rung up. A cashier flipping this
 * locally could walk through the full floor-plan/gratuity flow on a tenant
 * the server didn't agree was a restaurant: the sale would sync fine and
 * silently never reach the Kitchen Display. Changing mode is an
 * Owner/Manager action in Settings (with its own confirmation dialog) — not
 * something available from a device that's only ever authenticated as "some
 * paired till," regardless of whose PIN is currently active on it.
 */
export function ModePill({ mode }: { mode: TenantMode }) {
    const labels: Record<TenantMode, { icon: string; label: string }> = {
        retail:     { icon: '🛍',  label: 'Retail' },
        restaurant: { icon: '🍽',  label: 'Restaurant' },
        hardware:   { icon: '🔧', label: 'Hardware' },
        workshop:   { icon: '🔩', label: 'Workshop' },
    };
    const current = labels[mode] ?? labels.retail;

    return (
        <div
            className="mode-pill"
            role="status"
            aria-label={`POS mode: ${current.label}`}
            title="Set by your manager in Settings → Branches"
        >
            <span className="mode-pill__btn" style={{ color: '#fff' }}>
                <span>{current.icon}</span>
                <span>{current.label}</span>
            </span>
        </div>
    );
}

/*
 * Install UI — native only.
 *
 * Installing is the browser's job, and once installed so is "Open in app"
 * (Chrome/Edge show it in the address bar whenever the till is open in a
 * normal tab). So these only ever offer the browser's own one-tap install,
 * and only when the browser has actually offered it (beforeinstallprompt,
 * captured at startup in pwa/installPrompt.ts). No step-by-step "look for
 * the icon" instructions: when there's no native offer they simply don't
 * render. iPhone/iPad Safari has no install prompt at all, so there the card
 * shows one line pointing at Add to Home Screen instead of nothing.
 */

/** Compact install button for the till header. */
export function InstallAppButton() {
    const install = useInstallState();
    if (install.standalone || !install.canPrompt) return null;

    return (
        <button
            type="button"
            onClick={() => void promptInstall()}
            className="flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-300 shadow-sm transition-all hover:bg-blue-500/20 active:scale-95"
            title="Install Wivae POS as an app"
        >
            <span className="text-sm">📲</span>
            <span className="hidden sm:inline">Install</span>
        </button>
    );
}

/**
 * Install card for the entry screens (pairing, PIN login) — the first thing
 * someone sees after the marketing site's "Install the till app" link, so the
 * install happens before setup. Highlighted when that link brought them here
 * (?install=1).
 */
export function InstallAppCard() {
    const install = useInstallState();
    if (install.standalone) return null;
    if (!install.canPrompt && !install.ios) return null; // nothing native to offer

    return (
        <div
            className={`mt-4 flex items-center gap-3 rounded-2xl p-4 text-left ring-1 ${
                install.requested ? 'bg-blue-500/15 ring-blue-400/40' : 'bg-white/5 ring-white/10'
            }`}
        >
            <span className="text-2xl" aria-hidden>📲</span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Install the till app</p>
                <p className="text-xs text-slate-400">
                    {install.canPrompt
                        ? 'Opens full-screen from your home screen and works offline.'
                        : 'In Safari, tap Share, then Add to Home Screen.'}
                </p>
            </div>
            {install.canPrompt && (
                <button
                    type="button"
                    onClick={() => void promptInstall()}
                    className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 active:scale-95"
                >
                    Install
                </button>
            )}
        </div>
    );
}
