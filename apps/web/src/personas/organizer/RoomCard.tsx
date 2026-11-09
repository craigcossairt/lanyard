import { formatRange, type OpsSnapshot, type Session } from '@lanyard/contracts';
import { RoomTile } from '../../ui';

export function roomHealth(status: OpsSnapshot['rooms'][number]) {
  if (status.ratio >= 0.9) return { kind: 'crit' as const, label: 'Overflow risk' };
  if (status.ratio >= 0.75 || (status.signals.lost ?? 0) >= 5 || (status.signals.louder ?? 0) >= 5)
    return { kind: 'warn' as const, label: 'Needs attention' };
  return { kind: 'ok' as const, label: 'Within capacity' };
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
  return (
    <div className="ops-room-service">
      <RoomTile
        name={status.room.name}
        state={health.kind}
        stateLabel={`${stale ? 'Last known: ' : ''}${health.label}`}
        occupancy={status.occupancy}
        capacity={status.room.capacity}
        session={session ? `${session.title} · ${formatRange(session.startsAt, session.endsAt, timezone)}`
          : 'Between sessions · Ready for the next conversation'}
        stats={{ Questions: status.questionCount ?? '—', 'Lost · 60s': status.signals.lost ?? 0,
          'Louder · 60s': status.signals.louder ?? 0 }}
      />
      <p className="ops-room-detail">
        {status.room.capacity ? `${Math.round(status.ratio * 100)}% occupied` : 'Room closed'}{' '}
        <span>Target: under 90%</span>
      </p>
    </div>
  );
}
