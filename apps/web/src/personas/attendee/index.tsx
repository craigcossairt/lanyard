// Attendee persona: mounted by the WS0 shell under /a (default export renders the routes).
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import './attendee.css';

const Home = lazy(() => import('./Home'));
const Search = lazy(() => import('./Search'));

function Loading() {
  return (
    <p className="at-page at-main at-muted" role="status">
      Loading…
    </p>
  );
}

export default function AttendeeRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route index element={<Home />} />
        <Route path="search" element={<Search />} />
      </Routes>
    </Suspense>
  );
}
