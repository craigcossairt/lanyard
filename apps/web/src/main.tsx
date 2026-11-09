import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app/neutral-theme.css';
// import '../ui/styles.css'; // design system (apps/web/src/ui) replaces the neutral theme
import { api } from './app/api';
import { App } from './app/App';
import { captureFragmentToken } from './app/auth';
import { startRum } from './app/rum';
import { applyDocumentLocale } from './i18n/locale';
import './i18n/i18n.css';
import { applyRootPrefs } from './app/theme';

// 1. Take a role-link token out of the URL (#t=...) BEFORE RUM records the page URL.
captureFragmentToken();
// 2. Root attributes (theme, caption size, readable font, motion) and lang from saved prefs.
applyRootPrefs();
applyDocumentLocale();
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
