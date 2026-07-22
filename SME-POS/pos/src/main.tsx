import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyStoredTheme } from './pos/appTheme';

// Must run before the first paint — this is what actually fixes the bug
// where a light-mode user reloaded into a dark-looking page until their
// first click. getAppTheme()/setAppTheme() alone don't touch the DOM; this
// call is the only thing that sets data-theme on <html> before React (and
// every CSS rule scoped to [data-theme="light"]) ever renders a frame.
applyStoredTheme();

// Keep the service worker fresh; new deploys update the app shell on next load.
registerSW({ immediate: true });

const root = document.getElementById('app');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}
