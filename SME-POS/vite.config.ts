import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

/**
 * Wivae Dashboard — standalone Vite SPA config.
 *
 * Laravel + laravel-vite-plugin has been replaced by the Node.js/Hono server
 * in server/. The dashboard is now a plain React SPA served as static files
 * from public/. In dev, the Vite dev server proxies all API + auth traffic to
 * the Hono server on :3000, keeping session cookies on the same origin.
 *
 * Dev workflow:
 *   npm run server:dev   → Hono API on :3000
 *   npm run dev          → Vite dashboard on :5173 (proxies to :3000)
 *   npm run pos:dev      → POS PWA on :5174
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
    // Proxy API calls to the Hono server so session cookies stay same-origin.
    // The dashboard JS is served by Vite; everything else forwards to :3000.
    server: {
        host: "localhost",
        port: 5173,
        proxy: {
            // Auth + user endpoints
            "/login": "http://localhost:3000",
            "/logout": "http://localhost:3000",
            "/register": "http://localhost:3000",
            "/me": "http://localhost:3000",
            // All REST API routes used by resources/js/lib/api.ts
            "/dashboard": "http://localhost:3000",
            "/products": "http://localhost:3000",
            "/categories": "http://localhost:3000",
            "/staff": "http://localhost:3000",
            "/branches": "http://localhost:3000",
            "/devices": "http://localhost:3000",
            "/tasks": "http://localhost:3000",
            "/kitchen": "http://localhost:3000",
            "/orders": "http://localhost:3000",
            "/transactions": "http://localhost:3000",
            "/analytics": "http://localhost:3000",
            "/payroll": "http://localhost:3000",
            "/settings": "http://localhost:3000",
            "/billing": "http://localhost:3000",
            "/ai-insights": "http://localhost:3000",
            "/enquire": "http://localhost:3000",
            "/tenant-lookup": "http://localhost:3000",
            // POS sync + session (passthrough — POS has its own dev server)
            "/sync": "http://localhost:3000",
            "/pos": "http://localhost:3000",
        },
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
