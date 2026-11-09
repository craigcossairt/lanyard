import { useNavigate } from 'react-router';
import { formatRange, type Session } from '@lanyard/contracts';
import { Banner, Button, Card, ErrorState, LivePill, SkeletonList } from '../../ui';
import { roomById, useEventView } from '../attendee/lib/event';
import { useEventId, useSession } from '../attendee/lib/session';

export default function SessionPicker() {
  const eventId = useEventId();
  const me = useSession();
  const navigate = useNavigate();
  const { view, error, loading, reload } = useEventView(eventId);
  const tz = view?.event.timezone;
  const sessions: Session[] = [...(view?.now ?? []), ...(view?.next ?? [])];

  return (
    <div className="sp-page">
      <header className="sp-header">
        <a href="#main" className="ly-sr-only sp-skip">
          Skip to content
        </a>
        <span className="sp-brand">Lanyard · Speaker</span>
        {me?.handle && <span className="ly-muted">{me.handle}</span>}
      </header>
      <main id="main" className="sp-main sp-main--narrow">
        <h1>Pick your session</h1>
        <p className="ly-muted">
          Open the console on the laptop you present from. Chrome or Edge gives you live captions
          from the mic; other browsers get typed live notes.
        </p>
        {me && me.role !== 'speaker' && me.role !== 'organizer' && (
          <Banner tone="info">
            You are signed in as {me.role}. Captions and answering need a speaker link from the
            organizer.
          </Banner>
        )}
        {error && (
          <ErrorState title="Could not load the sessions" onRetry={reload}>
            {error}
          </ErrorState>
        )}
        {loading && !view && <SkeletonList count={3} />}
        {view && sessions.length === 0 && (
          <p className="ly-muted">No live or upcoming sessions in this event yet.</p>
        )}
        <ul className="sp-sessions">
          {sessions.map((s) => (
            <li key={s.id}>
              <Card>
                <div className="sp-session">
                  <div>
                    <p className="sp-session__meta ly-muted">
                      {formatRange(s.startsAt, s.endsAt, tz)}
                      {roomById(view?.rooms, s.roomId) &&
                        ` · ${roomById(view?.rooms, s.roomId)?.name}`}{' '}
                      {s.status === 'live' && <LivePill />}
                    </p>
                    <h2 className="sp-session__title">{s.title}</h2>
                    {s.speakerNames.length > 0 && (
                      <p className="ly-muted">{s.speakerNames.join(', ')}</p>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => navigate(`/s/${encodeURIComponent(s.id)}`)}
                  >
                    Open console
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
