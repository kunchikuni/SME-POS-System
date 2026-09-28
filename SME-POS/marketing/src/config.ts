/**
 * Dashboard URL — where "Start free trial" links point (sign-up lives on
 * the central dashboard address).
 *
 * In production: set PUBLIC_APP_URL in your deployment environment.
 * In dev: defaults to http://localhost:5173 automatically — no .env file needed.
 * Override: set PUBLIC_APP_URL to your real domain before building.
 */
const DEFAULT_APP_URL = import.meta.env.DEV
    ? "http://localhost:5173"
    : "https://app.wivae.com"; // replace with your real domain before going live

export const APP_URL = import.meta.env.PUBLIC_APP_URL ?? DEFAULT_APP_URL;

export const REGISTER_URL = `${APP_URL}/register`;

/**
 * API base URL — only needed for split-origin deployments (marketing on a CDN,
 * API on a separate host). Defaults to /api (same-origin) in both dev and prod.
 * If you split origins, set PUBLIC_API_URL and add this site's origin to the
 * CORS allowlist in server/src/index.ts.
 */
export const API_URL = import.meta.env.PUBLIC_API_URL ?? "/api";

/**
 * Signing in only works on a business's own workspace address
 * (<workspace>.<domain>) — the server resolves the business from the host,
 * and refuses a sign-in on the central address. So "Sign in" here asks for
 * the workspace and sends the visitor to that workspace's sign-in page.
 * (There used to be a plain LOGIN_URL = APP_URL/login, which could never
 * sign anyone in.)
 *
 * Dev: http://<workspace>.localhost:5173/login (dashboard Vite server).
 * Prod: https://<workspace>.<PUBLIC_TENANT_DOMAIN>/login.
 */
const TENANT_DOMAIN =
    import.meta.env.PUBLIC_TENANT_DOMAIN ?? (import.meta.env.DEV ? "localhost" : "wivae.com");

export function workspaceLoginUrl(workspace: string): string {
    return import.meta.env.DEV
        ? `http://${workspace}.${TENANT_DOMAIN}:5173/login`
        : `https://${workspace}.${TENANT_DOMAIN}/login`;
}

export const TENANT_SUFFIX = `.${TENANT_DOMAIN}`;
