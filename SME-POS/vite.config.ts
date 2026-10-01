import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

/**
 * Wivae Dashboard — standalone Vite SPA config.
 *
 * Laravel + laravel-vite-plugin has been replaced by the Node.js/Hono server
 * in server/. The dashboard is now a plain React SPA served as static files
 * from public/. In dev, the Vite dev server proxies API traffic to the Hono
 * server on :3000, keeping session cookies on the same origin.
 *
 * Dev workflow:
 *   npm run server:dev     → Hono API on :3000
 *   npm run dev            → Vite dashboard on :5173 (proxies to :3000)
 *   npm run pos:dev        → POS PWA on :5174 (Vite's auto-increment; no explicit port set)
 *   npm run marketing:dev  → Astro marketing site on :4321
 *   npm run dev:all        → all four together (concurrently)
 */
export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),

    plugins: [react(), tailwindcss()],

    resolve: {
        alias: {
            "@": fileURLToPath(new URL("resources/js", import.meta.url)),
        },
    },

    // ── Dev server ────────────────────────────────────────────────────────────
    // Three prefixes cover everything. The previous version enumerated ~20
    // page-shaped paths ("/products", "/payroll", …) — which was itself a
    // symptom of the SPA/API URL collision: any newly added endpoint had to
    // be remembered here or it silently broke in dev, and each entry shadowed
    // a real SPA page path. With the API namespaced under /api, the list
    // collapses and never needs touching again.
    server: {
        host: "0.0.0.0", // not "localhost" -- Node resolves that string itself
        // (often to IPv6 ::1 on Windows), while a hosts-file entry like
        // "127.0.0.1 demo.wivae.test" is explicitly IPv4. Two different
        // network stacks on the same port -- one connects, the other gets
        // refused, even though it looks like "the same localhost". Binding
        // to all interfaces removes the ambiguity.
        port: 5173,
        strictPort: true, // fail loudly instead of silently drifting to another port — see pos/vite.config.ts's docblock for the exact bug this prevents
        // Vite 6+ rejects requests whose Host header isn't recognized (a
        // DNS-rebinding protection) -- without this, browsing to
        // demo.wivae.test:5173 (or any tenant subdomain) gets blocked even
        // with the right /etc/hosts entry in place. ".wivae.test" allows
        // any subdomain, matching the tenant-per-subdomain design.
        allowedHosts: [".localhost", ".wivae.test"], // .localhost: workspaces in dev (<name>.localhost) — no hosts entries, secure context
        proxy: {
            // changeOrigin: false (the default) is intentional — we must NOT let
            // Vite replace the Host header with "localhost:3000". The Hono server's
            // resolveTenant middleware reads Host to extract the subdomain
            // ("demo" from "demo.wivae.test"), so swapping it for localhost causes
            // every tenant route to 404 with "No tenant for this host."
            // xfwd: true adds X-Forwarded-Host as a belt-and-braces fallback.
            "/api": {
                target: "http://localhost:3000",
                changeOrigin: false,
                xfwd: true,
            },
            "/sync": {
                target: "http://localhost:3000",
                changeOrigin: false,
                xfwd: true,
            },
            "/pos": {
                target: "http://localhost:3000",
                changeOrigin: false,
                xfwd: true,
            },
        },
    },

    // ── Dep optimisation ─────────────────────────────────────────────────────
    // List every CJS/UMD dep the dashboard actually imports so Vite pre-bundles
    // them all at server start rather than discovering them lazily on the first
    // browser request.  Lazy discovery triggers a synthetic "504 Outdated
    // Optimize Dep" response, React fails to mount (BrowserRouter is undefined
    // mid-render), and the login page is blank until the forced reload completes.
    //
    // Rules for this list:
    //   • Include every package (or sub-path) imported anywhere in resources/js.
    //   • Also include dev-runtime paths that Vite's own JSX transform injects
    //     (react/jsx-dev-runtime, react-dom/client) so they're never discovered
    //     lazily mid-session.
    //   • Pure ESM packages (dexie, dexie-react-hooks) are fine to omit because
    //     Vite handles them natively without a separate optimise step.
    optimizeDeps: {
        include: [
            'react',
            'react/jsx-dev-runtime',
            'react/jsx-runtime',
            'react-dom',
            'react-dom/client',
            'react-router-dom',
            'bcryptjs',
            'dexie',
            'dexie-react-hooks',
            'jsbarcode',
        ],
    },

    // ── Build ─────────────────────────────────────────────────────────────────
    // Output to public/ so the Hono server's serveStatic() catches it.
    // The Hono catch-all (`app.get('*', serveStatic({ path: '../public/index.html' }))`)
    // handles client-side React Router navigation.
    build: {
        outDir: fileURLToPath(new URL("public", import.meta.url)),
        emptyOutDir: false, // Don't nuke public/pos/ (POS PWA lives there)
        rollupOptions: {
            input: fileURLToPath(new URL("index.html", import.meta.url)),
        },
    },
});
