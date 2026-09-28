import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

/**
 * The POS is a standalone PWA, built separately from the dashboard and
 * served as static files under /pos/ on the tenant subdomain. Owning its
 * own index.html and a service worker gives it a clean /pos/ scope.
 *
 * The service worker precaches the app shell (Workbox) so the till cold-loads
 * with no network; all data lives in IndexedDB, so once bootstrapped the till is
 * fully usable offline. API calls (/sync/*, /pos/*) are deliberately NOT cached
 * — they must hit the network or fail fast to the outbox, never serve stale.
 */
export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    base: '/pos/',
    server: {
        // Explicit, not left to Vite's default (which is also 5173 — the same
        // default the dashboard's own vite.config.ts explicitly claims). With
        // both apps defaulting to the same port, `npm run dev:all`'s startup
        // order decided which one actually got 5173 and which one silently
        // fell back to 5174 — nondeterministic, and dev:all's four processes
        // don't start in a guaranteed order. This was a real, reproduced bug:
        // POS occasionally wins the race, dashboard fills back to 5174, and
        // demo.wivae.test:5173 looks broken while the dashboard is actually
        // one port over. strictPort: true means if 5174 is ever unavailable,
        // this fails loudly instead of silently drifting to a THIRD port and
        // reintroducing the same confusion one level up.
        port: 5174,
        strictPort: true,
        // Same fix as the dashboard's vite.config.ts: Vite's default host
        // ("localhost") lets Node resolve that string itself, often to IPv6
        // ::1 on Windows, while a hosts-file entry like "127.0.0.1
        // demo.wivae.test" is explicitly IPv4 -- two different network stacks
        // on the same port. Not yet hit here (till testing has stuck to plain
        // localhost so far), but the identical bug the moment anyone tries
        // demo.wivae.test:5174/pos/ instead.
        host: "0.0.0.0",
        allowedHosts: [".localhost", ".wivae.test"], // .localhost: workspaces in dev (<name>.localhost) — no hosts entries, secure context
        // POS dev proxy: in production /sync/* and /pos/* live on the same
        // origin as the PWA (one server, one port). In dev the POS runs on
        // :5174 (its own Vite process) but those API routes only exist on
        // :3000. Without this, every sync and session request from the till
        // hits :5174 and gets a Vite 404, breaking sync entirely in dev even
        // though the code is completely correct. Host header preserved via
        // the same proxyReq hook as the dashboard (see vite.config.ts).
        proxy: {
            "/sync": { target: "http://localhost:3000", changeOrigin: false, configure: (proxy) => { proxy.on("proxyReq", (pr, req) => { if (req.headers.host) pr.setHeader("host", req.headers.host); }); } },
            "/pos/session": { target: "http://localhost:3000", changeOrigin: false, configure: (proxy) => { proxy.on("proxyReq", (pr, req) => { if (req.headers.host) pr.setHeader("host", req.headers.host); }); } },
            "/pos/tasks": { target: "http://localhost:3000", changeOrigin: false, configure: (proxy) => { proxy.on("proxyReq", (pr, req) => { if (req.headers.host) pr.setHeader("host", req.headers.host); }); } },
        },
    },
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            /**
             * 'prompt' instead of 'autoUpdate': we use the onNeedRefresh /
             * onOfflineReady callbacks in main.tsx to surface an
             * UpdateAvailableBanner — the cashier controls when the reload
             * happens, so an in-progress sale is never silently interrupted.
             */
            registerType: 'prompt',
            // Serve the manifest + service worker in `vite dev` too. Without
            // this, the manifest index.html links to 404'd in dev, so the till
            // was never installable there and the Install button always fell
            // back to manual instructions. (Browsers additionally require a
            // secure context — HTTPS, localhost or *.localhost — to offer install.)
            devOptions: {
                enabled: true,
                type: 'module',
                navigateFallback: 'index.html',
            },
            includeAssets: [
                'icons/icon-192.png',
                'icons/icon-512.png',
                'icons/icon-512-maskable.png',
                'icons/apple-touch-icon.png',
                'offline.html',
            ],
            manifest: {
                id: '/pos/',
                name: 'Wivae POS',
                short_name: 'Wivae',
                description: 'Offline-first point of sale for retail, restaurant, hardware & workshop.',
                start_url: '/pos/',
                scope: '/pos/',
                /**
                 * display_override: modern browsers try this list first.
                 * window-controls-overlay gives a native title bar on desktop
                 * Chromium installs (cashier-station PCs). Browsers that don't
                 * support it fall back through the list to 'standalone'.
                 */
                display: 'standalone',
                display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
                orientation: 'any',
                background_color: '#0f172a',
                theme_color: '#1d4ed8',
                icons: [
                    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                    /**
                     * Maskable icon must be a SEPARATE file with content within
                     * the central 80% safe zone. Using the same src as the default
                     * icon causes clipping on Android and fails Chrome's PWA audit.
                     */
                    { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
                /**
                 * screenshots: Chrome 111+ shows a richer install dialog when
                 * these are present. Two entries cover narrow (mobile) and wide
                 * (desktop) form factors — the install prompt picks the right one.
                 */
                screenshots: [
                    {
                        src: 'screenshots/mobile.png',
                        sizes: '390x844',
                        type: 'image/png',
                        form_factor: 'narrow',
                        label: 'Wivae POS — retail till on mobile',
                    },
                    {
                        src: 'screenshots/desktop.png',
                        sizes: '1280x800',
                        type: 'image/png',
                        form_factor: 'wide',
                        label: 'Wivae POS — retail till on desktop',
                    },
                ],
            },
            workbox: {
                /**
                 * Tighter pattern — excludes Workbox's own sw.js/workbox-*.js
                 * from the precache manifest (they should never be cached by
                 * themselves; the SW file is special-cased by the browser).
                 * html is listed explicitly so only the entry index.html is
                 * matched, not any Workbox injection artifacts.
                 */
                globPatterns: ['**/*.{js,css,png,svg,woff2}', 'index.html'],
                globIgnores: ['**/sw.js', '**/workbox-*.js'],
                navigateFallback: '/pos/index.html',
                // Never let the SW answer API navigations from cache — API paths
                // must hit the network or fail fast to the outbox.
                navigateFallbackDenylist: [/\/sync\//, /\/pos\/session/, /\/api\//],
                /**
                 * offline.html is pre-cached so the branded fallback is
                 * available even when the shell itself has been purged from
                 * the cache (e.g., first visit while offline, or cache cleared).
                 */
                additionalManifestEntries: [{ url: '/pos/offline.html', revision: '1' }],
                runtimeCaching: [
                    /**
                     * Google Fonts: cache-first, long-lived. Fonts don't change
                     * per request and are safe to serve from cache indefinitely.
                     */
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                ],
            },
        }),
    ],
    // ── Dep optimisation ─────────────────────────────────────────────────────
    // Same rationale as the dashboard's vite.config.ts: list every CJS/UMD dep
    // the POS imports so Vite pre-bundles them all at dev-server start. Without
    // this the POS dev server can emit "504 Outdated Optimize Dep" for any dep
    // it discovers lazily on the first request (react-router-dom being the most
    // common culprit, as it was for the dashboard).
    optimizeDeps: {
        include: [
            'react',
            'react/jsx-dev-runtime',
            'react/jsx-runtime',
            'react-dom',
            'react-dom/client',
            'react-router-dom',
            'dexie',
            'dexie-react-hooks',
            'jsbarcode',
        ],
    },

    build: {
        outDir: fileURLToPath(new URL('../public/pos', import.meta.url)),
        emptyOutDir: true,
    },
});
