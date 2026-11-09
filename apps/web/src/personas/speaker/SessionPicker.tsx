import { Link } from 'react-router';
import { formatRange, type Session } from '@lanyard/contracts';
import { roomById, useEventView } from '../attendee/lib/event';
import { useEventId, useSession } from '../attendee/lib/session';

export default function SessionPicker() {
  const eventId = useEventId();
  const me = useSession();
  const { view, error, loading, reload } = useEventView(eventId);
  const tz = view?.event.timezone;
  const sessions: Session[] = [...(view?.now ?? []), ...(view?.next ?? [])];

  return (
    <div className="sp-page">
      <header className="sp-header">
        <a href="#main" className="at-skip">
          Skip to content
        </a>
        <span className="sp-brand">Lanyard · Speaker</span>
        {me?.handle && <span className="sp-muted">{me.handle}</span>}
      </header>
      <main id="main" className="sp-main sp-main--narrow">
        <h1>Pick your session</h1>
        <p className="sp-muted">
          Open the console on the laptop you present from. Chrome or Edge gives you live captions
          from the mic; other browsers get typed live notes.
        </p>
        {me && me.role !== 'speaker' && me.role !== 'organizer' && (
          <p className="sp-banner" role="status">
            You are signed in as {me.role}. Captions and answering need a speaker link from the
            organizer.
          </p>
        )}
        {error && (
          <div role="alert" className="sp-banner sp-banner--crit">
            <p>{error}</p>
            <button type="button" className="sp-btn" onClick={reload}>
              Try again
            </button>
          </div>
        )}
        {loading && !view && <p className="sp-muted">Loading sessions…</p>}
        {view && sessions.length === 0 && (
          <p className="sp-muted">No live or upcoming sessions in this event yet.</p>
        )}
        <ul className="sp-sessions">
          {sessions.map((s) => (
            <li key={s.id} className="sp-session">
              <div>
                <p className="sp-session__meta">
                  {formatRange(s.startsAt, s.endsAt, tz)}
                  {roomById(view?.rooms, s.roomId) && ` · ${roomById(view?.rooms, s.roomId)?.name}`}
                  {s.status === 'live' && <span className="sp-pill sp-pill--live"> ● Live</span>}
                </p>
                <h2 className="sp-session__title">{s.title}</h2>
                {s.speakerNames.length > 0 && (
                  <p className="sp-muted">{s.speakerNames.join(', ')}</p>
                )}
              </div>
              <Link className="sp-btn sp-btn--primary" to={`/s/${encodeURIComponent(s.id)}`}>
                Open console
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
