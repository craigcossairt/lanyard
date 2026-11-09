import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router';
import { homeFor } from './auth';
import { JoinPage } from './JoinPage';
import { PERSONAS, PersonaOutlet } from './personas';
import { RoleSwitcher, devToolsEnabled } from './RoleSwitcher';
import { useSession } from './session';

function Home() {
  const session = useSession();
  if (session) return <Navigate to={homeFor(session.claims.role)} replace />;
  return (
    <main className="shell">
      <h1>Lanyard</h1>
      <p className="muted">Live captions, questions and room status for every session.</p>
      <Link to="/join">Join an event</Link>
    </main>
  );
}

/** Persona routes need a token; without one, send people to /join. */
function Guard({ children }: { children: React.ReactNode }) {
  const session = useSession();
  return session ? children : <Navigate to="/join" replace />;
}

export function App() {
  const dev = devToolsEnabled();
  return (
    <BrowserRouter>
      {dev && <RoleSwitcher />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join" element={<JoinPage />} />
        {PERSONAS.map((p) => (
          <Route
            key={p.persona}
            path={`${p.prefix}/*`}
            element={
              <Guard>
                <PersonaOutlet def={p} />
              </Guard>
            }
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
