import { defineConfig } from "vite";
import laravel from "laravel-vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [
        laravel({ input: ["resources/js/app.tsx"], refresh: true }),
        react(),
        tailwindcss(),
    ],
    // Dev-server config for custom-domain development. The app is served by
    // Laravel on {tenant}.wivae.test while Vite serves modules from :5173 — a
    // different origin — so Vite must allow CORS. Not used by `npm run build`.
    server: {
        host: "0.0.0.0",
        cors: true,
        hmr: { host: "localhost" },
    },
});
