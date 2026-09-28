/**
 * Where workspaces live: <workspace>.<TENANT_DOMAIN>.
 *
 * Dev: "localhost" — browsers route every *.localhost name to this machine
 * (no hosts-file entries per workspace) and treat it as a secure context, so
 * the dashboard and till are installable in dev. Production sets
 * VITE_TENANT_DOMAIN to the real root domain (must match the server's
 * TENANT_DOMAIN).
 */
export const TENANT_DOMAIN: string =
    import.meta.env.VITE_TENANT_DOMAIN ?? (import.meta.env.DEV ? "localhost" : "wivae.com");

/** Keeps this page's protocol and (dev) port, e.g. http://spider.localhost:5173 */
export function workspaceOrigin(subdomain: string): string {
    const port = window.location.port ? `:${window.location.port}` : "";
    return `${window.location.protocol}//${subdomain}.${TENANT_DOMAIN}${port}`;
}

/** The central (no-workspace) site, where sign-up lives. */
export function centralOrigin(): string {
    const port = window.location.port ? `:${window.location.port}` : "";
    return `${window.location.protocol}//${TENANT_DOMAIN}${port}`;
}
