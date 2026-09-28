/**
 * Dashboard URL — where "Sign in" and "Start free trial" links point.
 *
 * In production: set PUBLIC_APP_URL in your deployment environment.
 * In dev: defaults to http://localhost:5173 automatically — no .env file needed.
 * Override: set PUBLIC_APP_URL to your real domain before building.
 */
const DEFAULT_APP_URL = import.meta.env.DEV
    ? "http://localhost:5173"
    : "https://app.wivae.com"; // replace with your real domain before going live

export const APP_URL = import.meta.env.PUBLIC_APP_URL ?? DEFAULT_APP_URL;

export const LOGIN_URL    = `${APP_URL}/login`;
export const REGISTER_URL = `${APP_URL}/register`;

/**
 * API base URL — only needed for split-origin deployments (marketing on a CDN,
 * API on a separate host). Defaults to /api (same-origin) in both dev and prod.
 * If you split origins, set PUBLIC_API_URL and add this site's origin to the
 * CORS allowlist in server/src/index.ts.
 */
export const API_URL = import.meta.env.PUBLIC_API_URL ?? "/api";

/**
 * Each business's till lives on its own workspace subdomain, at /pos/ — a
 * PWA can only be installed from its own origin, so the marketing page can't
 * install it directly. It sends the visitor to their workspace's till with
 * ?install=1, where the pairing screen leads with the install card.
 *
 * Dev: http://<workspace>.localhost:5174/pos/ (POS Vite server, see
 * pos/vite.config.ts) — *.localhost needs no hosts entries and is a secure
 * context, so the till can actually be installed from it.
 * Prod: https://<workspace>.<PUBLIC_TENANT_DOMAIN>/pos/.
 */
const TENANT_DOMAIN =
    import.meta.env.PUBLIC_TENANT_DOMAIN ?? (import.meta.env.DEV ? "localhost" : "wivae.com");

export function tillUrl(workspace: string): string {
    return import.meta.env.DEV
        ? `http://${workspace}.${TENANT_DOMAIN}:5174/pos/?install=1`
        : `https://${workspace}.${TENANT_DOMAIN}/pos/?install=1`;
}

export const TENANT_SUFFIX = `.${TENANT_DOMAIN}`;
