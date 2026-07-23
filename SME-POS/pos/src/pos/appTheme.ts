const STORAGE_KEY = 'pos-app-theme';
export type AppTheme = 'dark' | 'light';

/** Read the persisted theme; defaults to dark. */
export function getAppTheme(): AppTheme {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === 'light' || v === 'dark') return v;
    } catch { /* private/incognito */ }
    return 'dark';
}

/** Persist + apply the theme to the <html> element. */
export function setAppTheme(theme: AppTheme): void {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
    document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Call once before React renders (in main.tsx) so there's no
 * light-flash on a dark-preferring device.
 */
export function applyStoredTheme(): void {
    document.documentElement.setAttribute('data-theme', getAppTheme());
}
