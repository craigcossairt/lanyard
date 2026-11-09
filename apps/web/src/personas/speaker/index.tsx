// Speaker persona: mounted by the WS0 shell under /s (default export renders the routes).
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import '../attendee/attendee.css';
import './speaker.css';

const SessionPicker = lazy(() => import('./SessionPicker'));
const Console = lazy(() => import('./Console'));

function Loading() {
  return (
    <p className="sp-page sp-main sp-muted" role="status">
      Loading…
    </p>
  );
}

export default function SpeakerRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route index element={<SessionPicker />} />
        <Route path=":id" element={<Console />} />
        <Route path="*" element={<SessionPicker />} />
      </Routes>
    </Suspense>
  );
}
