// Attendee persona: mounted by the WS0 shell under /a (default export renders the routes).
import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router';
import './attendee.css';

const Home = lazy(() => import('./Home'));
const Search = lazy(() => import('./Search'));

/** Placeholder until the real screen lands (live view, plan my day, settings follow in later PRs). */
function ComingSoon({ what }: { what: string }) {
  return (
    <main id="main" className="at-page at-main">
      <h1>{what}</h1>
      <p className="at-muted">This screen is on its way. Head back home for now.</p>
      <Link className="at-btn" to="/a">
        Home
      </Link>
    </main>
  );
}

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
        <Route path="s/:id" element={<ComingSoon what="Live session" />} />
        <Route path="plan" element={<ComingSoon what="Plan my day" />} />
        <Route path="settings" element={<ComingSoon what="Display & access" />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Suspense>
  );
}
