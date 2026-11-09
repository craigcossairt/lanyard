import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { JoinPage } from './JoinPage';
import { Landing } from './Landing';
import { PERSONAS, PersonaOutlet } from './personas';
import { QrPage } from './QrPage';
import { RoleSwitcher, devToolsEnabled } from './RoleSwitcher';
import { useSession } from './session';

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
        <Route path="/" element={<Landing />} />
        <Route path="/qr/:eventId" element={<QrPage />} />
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
