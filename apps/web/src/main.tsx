import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles.css'; // design system: tokens, themes, components (apps/web/src/ui)
import './app/shell.css'; // the shell's own pages: landing, join, QR, role switcher
import { api } from './app/api';
import { App } from './app/App';
import { captureFragmentToken } from './app/auth';
import { startRum } from './app/rum';
import { applyRootPrefs } from './app/theme';

// 1. Take a role-link token out of the URL (#t=...) BEFORE RUM records the page URL.
captureFragmentToken();
// 2. Root attributes (theme, caption size, readable font, motion) from saved prefs.
applyRootPrefs();
// 3. RUM from runtime config (never blocks rendering).
api
  .config()
  .then(startRum)
  .catch(() => {});

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
