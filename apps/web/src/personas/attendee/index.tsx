// Attendee persona: mounted by the WS0 shell under /a (default export renders the routes).
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { ToastProvider } from './components/Toast';
import { applyPrefs } from './lib/prefs';
import './attendee.css';

// Saved display prefs take effect before the first screen paints.
applyPrefs();

const Home = lazy(() => import('./Home'));
const Search = lazy(() => import('./Search'));
const SessionLive = lazy(() => import('./SessionLive'));
const PlanMyDay = lazy(() => import('./PlanMyDay'));
const Settings = lazy(() => import('./Settings'));

function Loading() {
  return (
    <p className="at-page at-main at-muted" role="status">
      Loading…
    </p>
  );
}

export default function AttendeeRoutes() {
  return (
    <ToastProvider>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Home />} />
          <Route path="search" element={<Search />} />
          <Route path="s/:id" element={<SessionLive />} />
          <Route path="plan" element={<PlanMyDay />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
    </ToastProvider>
  );
}
