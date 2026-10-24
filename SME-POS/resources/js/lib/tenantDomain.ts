/**
 * Where workspaces live: <workspace>.<TENANT_DOMAIN>.
 *
 * Dev: "localhost" — browsers route every *.localhost name to this machine
 * (no hosts-file entries per workspace) and treat it as a secure context, so
 * the dashboard and till are installable in dev. Production sets
 * VITE_TENANT_DOMAIN to the real root domain (must match the server's
 * TENANT_DOMAIN).
 */
// `||`, not `??`: a Docker build without the build argument sets this to an
// EMPTY string, which `??` would keep — giving workspace links like "spider."
export const TENANT_DOMAIN: string =
    import.meta.env.VITE_TENANT_DOMAIN || (import.meta.env.DEV ? "localhost" : "wivae.com");

/** Keeps this page's protocol and (dev) port, e.g. http://spider.localhost:5173 */
export function workspaceOrigin(subdomain: string): string {
    const port = window.location.port ? `:${window.location.port}` : "";
    return `${window.location.protocol}//${subdomain}.${TENANT_DOMAIN}${port}`;
}

/**
 * The central (no-workspace) app address, where sign-up lives.
 *
 * Dev: the bare domain IS the dashboard server. Production: the bare domain is
 * the static marketing site, which has no /register — the app's central
 * address is app.<domain> ("app" is a reserved workspace name), the same
 * address the marketing site's PUBLIC_APP_URL points at.
 */
export function centralOrigin(): string {
    const port = window.location.port ? `:${window.location.port}` : "";
    const host = import.meta.env.DEV ? TENANT_DOMAIN : `app.${TENANT_DOMAIN}`;
    return `${window.location.protocol}//${host}${port}`;
}
