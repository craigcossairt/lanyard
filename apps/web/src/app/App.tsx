import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router';
import { useI18n } from '../i18n/useI18n';
import { homeFor } from './auth';
import { JoinPage } from './JoinPage';
import { PERSONAS, PersonaOutlet } from './personas';
import { RoleSwitcher, devToolsEnabled } from './RoleSwitcher';
import { useSession } from './session';

function Home() {
  const session = useSession();
  const { t } = useI18n();
  if (session) return <Navigate to={homeFor(session.claims.role)} replace />;
  return (
    <main id="main" tabIndex={-1} className="shell">
      <a href="#main" className="skip-link">
        {t('skip')}
      </a>
      <h1>Lanyard</h1>
      <p className="muted">Live captions, questions and room status for every session.</p>
      <Link to="/join">{t('joinTitle')}</Link>
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
