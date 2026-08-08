/**
 * The dashboard (login, register, and everything behind it) is a separate
 * app/origin from this marketing site now — before the split, "/login" as a
 * bare relative link worked because both lived in one SPA. Set this to the
 * dashboard's actual URL at build time.
 *
 * NOTE — pre-existing gap, not introduced by this split: /login only makes
 * sense on an already-known tenant subdomain (acme.wivae.com/login) since
 * ResolveTenant requires one. A visitor arriving here from a search engine
 * doesn't know their subdomain. The old unified SPA had the exact same gap,
 * just less visibly (a bare same-origin /login could at least render before
 * failing to resolve a tenant on submit). The real fix is a central
 * "find your shop" flow using the existing GET /api/tenant-lookup endpoint
 * before linking anywhere near /login from here — not built yet.
 */
export const APP_URL = import.meta.env.PUBLIC_APP_URL ?? "https://app.wivae.test";

export const LOGIN_URL = `${APP_URL}/login`;
export const REGISTER_URL = `${APP_URL}/register`;

/**
 * Base URL for the Node/Hono API. Defaults to same-origin "/api" for a
 * co-located deployment (this site and the API behind the same reverse
 * proxy/domain); set PUBLIC_API_URL for a cross-origin deployment (e.g. this
 * site on a CDN, API elsewhere) — the API's CORS allowlist
 * (server/src/index.ts) needs this site's actual origin added either way.
 */
export const API_URL = import.meta.env.PUBLIC_API_URL ?? "/api";
