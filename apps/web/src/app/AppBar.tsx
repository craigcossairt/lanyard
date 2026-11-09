// One app bar above every persona: wordmark (home), event, persona, navigation, display settings.
// Persona folders keep their own page headers; this bar is what makes them one product.
import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import type { AccessibilityPrefs } from '@lanyard/contracts';
import { Button, Sheet, StatusPill } from '../ui';
import { EVENT_NAMES, Wordmark } from './brand';
import type { PersonaDef } from './personas';
import { useSession } from './session';
import { loadPrefs, setRootPrefs } from './theme';

const NAV: Record<string, Array<{ to: string; label: string; end?: boolean }>> = {
  attendee: [
    { to: '/a', label: 'Sessions', end: true },
    { to: '/a/search', label: 'Search' },
    { to: '/a/plan', label: 'Plan my day' },
  ],
  speaker: [{ to: '/s', label: 'My sessions', end: true }],
  organizer: [{ to: '/o', label: 'Ops board', end: true }],
};

const THEMES: Array<[NonNullable<AccessibilityPrefs['theme']>, string]> = [
  ['dark', 'Dark'],
  ['light', 'Light'],
  ['contrast', 'High contrast'],
];
const SIZES: Array<[NonNullable<AccessibilityPrefs['captionSize']>, string]> = [
  ['m', 'M'],
  ['l', 'L'],
  ['xl', 'XL'],
  ['xxl', 'XXL'],
];

/** Theme and caption size for personas without their own settings page. Applies instantly. */
function DisplayChoices() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const set = (patch: AccessibilityPrefs) => setPrefs(setRootPrefs(patch));
  return (
    <div className="ly-prefs">
      <fieldset>
        <legend>Colours</legend>
        <div className="ly-prefs__row">
          {THEMES.map(([v, l]) => (
            <Button
              key={v}
              aria-pressed={(prefs.theme ?? 'dark') === v}
              onClick={() => set({ theme: v })}
            >
              {l}
            </Button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Caption size</legend>
        <div className="ly-prefs__row">
          {SIZES.map(([v, l]) => (
            <Button
              key={v}
              aria-pressed={(prefs.captionSize ?? 'm') === v}
              aria-label={`Caption size ${l}`}
              onClick={() => set({ captionSize: v })}
            >
              {l}
            </Button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Skip past the bar to the persona's main content (#main, else the first <main>). */
function skipToMain(e: React.MouseEvent<HTMLAnchorElement>) {
  const main = document.getElementById('main') ?? document.querySelector('main');
  if (!main) return;
  e.preventDefault();
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus();
}

/** Full-screen stage views (attendee live session, speaker console) carry their own header. */
const IMMERSIVE = /^\/(a\/s|s)\/[^/]+/;

export function AppBar({ def }: { def: PersonaDef }) {
  const session = useSession();
  const { pathname } = useLocation();
  const [display, setDisplay] = useState(false);
  const eventId = session?.claims.eventId;
  const eventName = eventId ? (EVENT_NAMES[eventId] ?? eventId) : undefined;
  const nav = NAV[def.persona] ?? [];
  if (IMMERSIVE.test(pathname)) return null;

  return (
    <header className="appbar">
      <a href="#main" className="skip-link" onClick={skipToMain}>
        Skip to content
      </a>
      <Link to="/" className="wordmark-link" aria-label="Lanyard home">
        <Wordmark />
      </Link>
      <span className="appbar__context">
        {eventName && <span className="appbar__event">{eventName}</span>}
        <StatusPill tone="info" icon={null}>
          {def.label}
        </StatusPill>
      </span>
      {nav.length > 1 && (
        <nav className="appbar__nav" aria-label={`${def.label} sections`}>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      )}
      <span className="appbar__end">
        {def.persona === 'attendee' ? (
          <NavLink to="/a/settings" className="ly-btn ly-btn--ghost">
            Settings
          </NavLink>
        ) : (
          <Button variant="ghost" icon="display" onClick={() => setDisplay(true)}>
            Display
          </Button>
        )}
      </span>
      {def.persona !== 'attendee' && (
        <Sheet open={display} onClose={() => setDisplay(false)} title="Display">
          <DisplayChoices />
        </Sheet>
      )}
    </header>
  );
}
