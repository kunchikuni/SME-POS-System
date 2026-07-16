import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * Test config for the POS client. Separate from vite.config.ts so tests don't
 * load the PWA/Tailwind plugins. jsdom gives us window/localStorage/navigator;
 * fake-indexeddb (via setup) gives Dexie a real IndexedDB to run against, so the
 * offline data layer is tested for real, not mocked away.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
