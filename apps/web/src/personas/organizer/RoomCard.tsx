import { formatRange, type OpsSnapshot, type Session } from '@lanyard/contracts';

export function roomHealth(status: OpsSnapshot['rooms'][number]) {
  if (status.ratio >= 0.9) return { kind: 'crit', label: 'Overflow risk' };
  if (status.ratio >= 0.75 || (status.signals.lost ?? 0) >= 5 || (status.signals.louder ?? 0) >= 5)
    return { kind: 'warn', label: 'Needs attention' };
  return { kind: 'ok', label: 'Within capacity' };
}

export function RoomCard({
  status,
  session,
  timezone,
  stale,
}: {
  status: OpsSnapshot['rooms'][number];
  session?: Session;
  timezone: string;
  stale: boolean;
}) {
  const health = roomHealth(status);
  const titleId = `room-${status.room.id}`;
  return (
    <article className={`ops-room ops-${health.kind}`} aria-labelledby={titleId}>
      <header>
        <h3 id={titleId}>{status.room.name}</h3>
        <span className="ops-badge">
          {stale ? 'Last known: ' : ''}
          {health.label}
        </span>
      </header>
      <p className="ops-occupancy">
        <strong>{status.occupancy}</strong>
        <span>/ {status.room.capacity} people</span>
      </p>
      <progress
        aria-label={`${status.room.name} occupancy`}
        value={status.occupancy}
        max={Math.max(1, status.room.capacity)}
      />
      <p className="ops-room-detail">
        {status.room.capacity ? `${Math.round(status.ratio * 100)}% occupied` : 'Room closed'}{' '}
        <span>Target: under 90%</span>
      </p>
      <div className="ops-session">
        <span className="ops-eyebrow">{session ? 'On stage now' : 'Between sessions'}</span>
        <h4>{session?.title ?? 'Ready for the next conversation'}</h4>
        {session && <p>{formatRange(session.startsAt, session.endsAt, timezone)}</p>}
      </div>
      <dl className="ops-room-stats">
        <div>
          <dt>Questions</dt>
          <dd>{status.questionCount ?? '—'}</dd>
        </div>
        <div>
          <dt>Lost · 60s</dt>
          <dd>{status.signals.lost ?? 0}</dd>
        </div>
        <div>
          <dt>Louder · 60s</dt>
          <dd>{status.signals.louder ?? 0}</dd>
        </div>
      </dl>
    </article>
  );
}
