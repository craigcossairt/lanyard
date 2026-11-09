import { Link } from 'react-router';
import { formatRange, type Room, type Session } from '@lanyard/contracts';
import { parseHighlight } from '../lib/highlight';

interface Props {
  session: Session;
  room?: Room;
  tz?: string;
  highlights?: string[];
  saved: boolean;
  onToggleSave: (session: Session) => void;
  /** Extra line under the title, e.g. a plan-my-day reason. */
  reason?: string;
}

export function SessionCard({ session, room, tz, highlights, saved, onToggleSave, reason }: Props) {
  const live = session.status === 'live';
  const headingId = `sess-${session.id}`;
  return (
    <article className="at-card" aria-labelledby={headingId}>
      <div className="at-card__meta">
        <span>{formatRange(session.startsAt, session.endsAt, tz)}</span>
        {room && <span>· {room.name}</span>}
        {live && (
          <span className="at-pill at-pill--live">
            <span aria-hidden="true">●</span> Live
          </span>
        )}
      </div>
      <h3 id={headingId} className="at-card__title">
        {live ? (
          <Link to={`/a/s/${encodeURIComponent(session.id)}`}>{session.title}</Link>
        ) : (
          session.title
        )}
      </h3>
      {session.speakerNames.length > 0 && (
        <p className="at-card__speakers">{session.speakerNames.join(', ')}</p>
      )}
      {reason && <p className="at-card__reason">{reason}</p>}
      {highlights && highlights.length > 0 && (
        <p className="at-card__why">
          <span className="at-card__why-label">Why this matched: </span>
          {parseHighlight(highlights[0] ?? '').map((part, i) =>
            part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>,
          )}
        </p>
      )}
      <div className="at-card__actions">
        <span className="at-chip">{session.track}</span>
        <button
          type="button"
          className="at-btn at-btn--sm"
          aria-pressed={saved}
          onClick={() => onToggleSave(session)}
        >
          {saved ? '✓ In my schedule' : '+ My schedule'}
        </button>
        {live && (
          <Link className="at-btn at-btn--sm at-btn--primary" to={`/a/s/${encodeURIComponent(session.id)}`}>
            Join live
          </Link>
        )}
      </div>
    </article>
  );
}
