import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app/neutral-theme.css';
// import '../ui/styles.css'; // design system (apps/web/src/ui) replaces the neutral theme
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
