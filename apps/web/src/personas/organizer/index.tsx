import { useState } from 'react';
import { Link } from 'react-router';
import { EVENT_IDS, formatTime } from '@lanyard/contracts';
import { useSession } from '../../app/session';
import { Button, StatusPill } from '../../ui';
import { Alerts } from './Alerts';
import { AskConference } from './AskConference';
import { ObservabilityLinks } from './ObservabilityLinks';
import { RoomCard, roomHealth } from './RoomCard';
import { useOps } from './useOps';
import { SimulationControls } from './SimulationControls';
import './organizer.css';

function Board({ eventId }: { eventId: string }) {
  const { data, error, stream, refresh } = useOps(eventId);
  if (!data)
    return (
      <section className="ops-empty" role="status">
        <h2>{error ? 'Live readings unavailable' : 'Connecting to your conference…'}</h2>
        <p>
          {error
            ? 'Check the event connection and try again. Occupancy is never estimated.'
            : 'Loading rooms, attendance and audience signals.'}
        </p>
        {error && <Button onClick={refresh}>Retry readings</Button>}
      </section>
    );
  const { snapshot, view, at } = data;
  const attention = snapshot.rooms.filter((r) => roomHealth(r).kind !== 'ok').length;
  return (
    <>
      <p className={`ops-live ${error ? 'ops-crit' : ''}`} role="status">
        <StatusPill tone={error ? 'crit' : stream === 'open' ? 'ok' : 'warn'}>{error
          ? 'Readings unavailable · showing last known state'
          : stream === 'open'
            ? 'Live stream connected'
            : stream === 'connecting'
              ? 'Connecting live stream · polling every 10 seconds'
              : 'Stream reconnecting · polling every 10 seconds'}</StatusPill>{' '}
        <span>Updated {formatTime(at, view.event.timezone)}</span>
      </p>
      {eventId === EVENT_IDS.cnhDemos && <SimulationControls eventId={eventId} timezone={view.event.timezone} />}
      <dl className="ops-summary">
        <div>
          <dt>People in rooms</dt>
          <dd>{snapshot.rooms.reduce((n, r) => n + r.occupancy, 0)}</dd>
        </div>
        <div>
          <dt>Rooms reporting</dt>
          <dd>{snapshot.rooms.length}</dd>
        </div>
        <div>
          <dt>Need attention</dt>
          <dd>{attention}</dd>
        </div>
        <div>
          <dt>Capacity objective</dt>
          <dd>
            &lt;90<span>%</span>
          </dd>
        </div>
      </dl>
      <div className="ops-layout">
        <section aria-labelledby="ops-rooms-title">
          <div className="ops-section-heading">
            <h2 id="ops-rooms-title">Rooms as services</h2>
            <span>{view.event.name}</span>
          </div>
          <div className="ops-grid">
            {snapshot.rooms.map((status) => (
              <RoomCard
                key={status.room.id}
                status={status}
                session={view.now.find((s) => s.id === status.sessionId)}
                timezone={view.event.timezone}
                stale={error}
              />
            ))}
          </div>
          {!snapshot.rooms.length && (
            <p className="ops-empty">No rooms are configured for this event yet.</p>
          )}
        </section>
        <Alerts
          snapshot={snapshot}
          eventId={eventId}
          timezone={view.event.timezone}
          stale={error}
          refresh={refresh}
        />
      </div>
      <AskConference view={view} />
      <ObservabilityLinks />
    </>
  );
}

export default function Organizer() {
  const session = useSession();
  const [selected, setSelected] = useState<string>();
  const eventId = selected ?? session?.claims.eventId ?? EVENT_IDS.cnhDemos;
  return (
    <main className="ops-page">
      <header className="ops-header">
        <div>
          <span className="ops-eyebrow">Lanyard / organizer</span>
          <h1>
            Conference operations<span>.</span>
          </h1>
          <p>Rooms are services. Attendees are traffic.</p>
        </div>
        <label className="ops-event">
          Event
          <select value={eventId} onChange={(event) => setSelected(event.target.value)}>
            <option value={EVENT_IDS.cnhDemos}>CNH Demos</option>
            <option value={EVENT_IDS.kubecon}>KubeCon NA 2026</option>
            {![...Object.values(EVENT_IDS)].includes(eventId as typeof EVENT_IDS.cnhDemos) && (
              <option value={eventId}>{eventId}</option>
            )}
          </select>
        </label>
      </header>
      {session?.claims.role !== 'organizer' || eventId !== session.claims.eventId ? (
        <section className="ops-empty">
          <h2>Open this event’s organizer link</h2>
          <p>Each organizer link grants access to one event.</p>
          <Link to="/join">Open an organizer link to continue</Link>
        </section>
      ) : (
        <Board key={`${eventId}:${session.claims.sub}:${session.claims.iat}`} eventId={eventId} />
      )}
    </main>
  );
}
