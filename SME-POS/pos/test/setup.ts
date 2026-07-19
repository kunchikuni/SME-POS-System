// Give Dexie a working IndexedDB implementation inside jsdom.
import 'fake-indexeddb/auto';
// Extend expect() with DOM matchers (toBeEnabled, toBeInTheDocument, …).
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees between tests so the DOM doesn't leak across cases.
afterEach(() => cleanup());
