import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

/**
 * The POS is a standalone PWA, built separately from the Inertia dashboard and
 * served as static files under /pos/ on the tenant subdomain. Keeping it out of
 * laravel-vite-plugin lets it own a real index.html and a service worker with a
 * clean /pos/ scope.
 *
 * The service worker precaches the app shell (Workbox) so the till cold-loads
 * with no network; all data lives in IndexedDB, so once bootstrapped the till is
 * fully usable offline. API calls (/sync/*, /pos/*) are deliberately NOT cached
 * — they must hit the network or fail fast to the outbox, never serve stale.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/pos/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        id: '/pos/',
        name: 'Wivae POS',
        short_name: 'Wivae',
        description: 'Offline-first point of sale.',
        start_url: '/pos/',
        scope: '/pos/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#1d4ed8',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/pos/index.html',
        // Never let the SW answer API navigations from cache.
        navigateFallbackDenylist: [/\/sync\//, /\/pos\/session/],
      },
    }),
  ],
  build: {
    outDir: fileURLToPath(new URL('../public/pos', import.meta.url)),
    emptyOutDir: true,
  },
});
