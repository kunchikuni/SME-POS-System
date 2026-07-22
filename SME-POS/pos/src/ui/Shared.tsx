import { useState } from 'react';
import { useSyncStatus } from './useSyncStatus';
import type { TenantMode } from '../types/contract';
import { getAppTheme, setAppTheme, type AppTheme } from '../pos/appTheme';

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
    return (
        <div
            className="mode-pill"
            role="status"
            aria-label={`POS mode: ${mode === 'retail' ? 'Retail' : 'Restaurant'}`}
            title="Set by your manager in Settings"
        >
            <div
                className={`mode-pill__track ${
                    mode === 'retail' ? 'mode-pill__track--retail' : 'mode-pill__track--resto'
                }`}
            />

            <span
                className="mode-pill__btn"
                style={{ color: mode === 'retail' ? '#fff' : 'rgba(255,255,255,0.45)' }}
            >
        <span>🛍</span>
        <span>Retail</span>
      </span>

            <span
                className="mode-pill__btn"
                style={{ color: mode === 'restaurant' ? '#fff' : 'rgba(255,255,255,0.45)' }}
            >
        <span>🍽</span>
        <span>Restaurant</span>
      </span>
        </div>
    );
}
