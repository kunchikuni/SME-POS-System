import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Wivae marketing site — deliberately its own Astro app, not part of the
 * dashboard SPA. See the "dashboard vs marketing rendering strategy" ADR
 * (docs/adr/0001-marketing-site-split.md) for the full reasoning: this page
 * is the one place in the product where SSR/SSG has real, measurable value
 * (SEO indexing, first-paint speed for cold anonymous visitors) — the
 * authenticated dashboard doesn't share that profile, and stays on the
 * existing Vite SPA + Hono API.
 *
 * output: "static" — this page has no per-request personalization (no
 * tenant, no session). A full static build, deployable to any CDN,
 * independent of the Node API's uptime for the page itself.
 */
export default defineConfig({
  output: "static",
  integrations: [react()],
  server: {
    port: 4321, // explicit for clarity in `npm run dev:all`'s combined log output
  },
  vite: {
    plugins: [tailwindcss()],
    // Dev only: in production the marketing build is served same-origin with
    // the API (config.ts's API_URL defaults to /api). Without this, /api calls
    // from :4321 (tenant lookup, enquiry form) hit Astro's dev server and 404.
    server: {
      proxy: { "/api": { target: "http://localhost:3000", changeOrigin: false } },
    },
  },
});
