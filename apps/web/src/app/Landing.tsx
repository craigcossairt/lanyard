// `/`: the product in one glance. Tagline, three persona doors, today's event.
// People who already hold a role token get a "Continue" door instead of a redirect,
// so the page still works as the video's opening frame.
import { Link, useNavigate } from 'react-router';
import type { Role } from '@lanyard/contracts';
import { EVENT_IDS } from '@lanyard/contracts';
import { Icon, LivePill, type IconName } from '../ui';
import { homeFor, rememberedRoles, saveToken } from './auth';
import { EVENT_NAMES, Wordmark } from './brand';

interface Door {
  role: Role;
  icon: IconName;
  title: string;
  body: string;
}

const DOORS: Door[] = [
  {
    role: 'attendee',
    icon: 'people',
    title: 'Attendees',
    body: 'Live captions at your size, anonymous questions, and a quiet “slower” or “louder” to the speaker.',
  },
  {
    role: 'speaker',
    icon: 'mic',
    title: 'Speakers',
    body: 'Captions out, the room’s signals in, and questions grouped so you answer the one everyone is asking.',
  },
  {
    role: 'organizer',
    icon: 'route',
    title: 'Organizers',
    body: 'Rooms as services: occupancy, caption lag and SLOs, overflow alerts and one-tap reroutes.',
  },
];

const EVENT = EVENT_IDS.cnhDemos;

export function Landing() {
  const navigate = useNavigate();
  const held = rememberedRoles();

  const enter = (role: Role) => {
    const s = held.find((r) => r.claims.role === role);
    if (s) {
      saveToken(s.token);
      navigate(homeFor(role));
    }
  };

  return (
    <main className="page landing" id="main">
      <header className="page__brand">
        <Wordmark />
      </header>

      <section className="landing__hero" aria-labelledby="landing-title">
        <h1 id="landing-title">Conferences, observable.</h1>
        <p className="landing__lede">
          One live companion for the people in the room, the person on stage and the team running
          the event, with every caption, question and reroute traced end to end.
        </p>
      </section>

      <section aria-labelledby="doors-title">
        <h2 id="doors-title" className="ly-sr-only">
          Choose your view
        </h2>
        <ul className="landing__doors">
          {DOORS.map((d) => {
            const has = held.some((r) => r.claims.role === d.role);
            return (
              <li key={d.role} className="ly-card door">
                <Icon name={d.icon} className="door__icon" />
                <h3>{d.title}</h3>
                <p>{d.body}</p>
                {d.role === 'attendee' && !has ? (
                  <Link className="ly-btn ly-btn--primary" to={`/join?event=${EVENT}`}>
                    Join anonymously
                  </Link>
                ) : has ? (
                  <button
                    type="button"
                    className="ly-btn ly-btn--primary"
                    onClick={() => enter(d.role)}
                  >
                    Continue as {d.title.toLowerCase().replace(/s$/, '')}
                  </button>
                ) : (
                  <p className="door__note">Opens from the role link your organizer sends you.</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="ly-card landing__event" aria-labelledby="event-title">
        <div>
          <LivePill>Today</LivePill>
          <h2 id="event-title">{EVENT_NAMES[EVENT]}</h2>
          <p className="muted">Cloud Native Hackathon · Salt Lake City · Mon 9 Nov 2026</p>
        </div>
        <div className="landing__event-actions">
          <Link className="ly-btn ly-btn--primary ly-btn--lg" to={`/join?event=${EVENT}`}>
            Join the event
          </Link>
          <Link className="ly-btn" to={`/qr/${EVENT}`}>
            Show join QR
          </Link>
        </div>
      </section>

      <p className="page__foot muted">
        No sign-up and no personal data. Attendees get a random handle.
      </p>
    </main>
  );
}
