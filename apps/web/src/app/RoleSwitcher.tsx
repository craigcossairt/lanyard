// Dev/demo role switcher: lists every role token this browser holds (from role links
// or joins) and switches the active one. Shown in dev, or anywhere with ?dev=1 once.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { homeFor, rememberedRoles, saveToken, signOut } from './auth';
import { useSession } from './session';

const DEV_FLAG = 'lanyard.dev';

export function devToolsEnabled(): boolean {
  if (new URLSearchParams(window.location.search).get('dev') === '1') {
    localStorage.setItem(DEV_FLAG, '1');
  }
  return import.meta.env.DEV || localStorage.getItem(DEV_FLAG) === '1';
}

export function RoleSwitcher() {
  const session = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const roles = rememberedRoles();

  return (
    <div className="role-switcher">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {session
          ? `${session.claims.role} · ${session.claims.handle ?? session.claims.eventId}`
          : 'signed out'}
      </button>
      {open && (
        <ul role="menu">
          {roles.map((r) => (
            <li key={r.claims.role}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  saveToken(r.token);
                  setOpen(false);
                  navigate(homeFor(r.claims.role));
                }}
              >
                {r.claims.role} ({r.claims.eventId})
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                signOut();
                setOpen(false);
                navigate('/join?again=1');
              }}
            >
              Join as a new attendee
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
