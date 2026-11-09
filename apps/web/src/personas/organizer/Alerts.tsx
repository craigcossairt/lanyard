import { useState } from 'react';
import { formatTime, RerouteResponse, type OpsSnapshot } from '@lanyard/contracts';
import { api } from '../../app/api';
import { Button, Card, StatusPill } from '../../ui';

export function Alerts({
  snapshot,
  eventId,
  timezone,
  stale,
  refresh,
}: {
  snapshot: OpsSnapshot;
  eventId: string;
  timezone: string;
  stale: boolean;
  refresh: () => void;
}) {
  const [pending, setPending] = useState<string>();
  const [notice, setNotice] = useState('');
  const [sent, setSent] = useState<Record<string, number>>({});
  const alerts = [...snapshot.alerts].sort(
    (a, b) =>
      Number(Boolean(a.resolvedAt)) - Number(Boolean(b.resolvedAt)) ||
      b.openedAt.localeCompare(a.openedAt),
  );
  const reroute = async (id: string) => {
    setPending(id);
    setNotice('Finding nearby sessions with seats…');
    try {
      const result = RerouteResponse.parse(
        await api.post(
          `/events/${encodeURIComponent(eventId)}/alerts/${encodeURIComponent(id)}/reroute`,
        ),
      );
      if (result.suggested) setSent((previous) => ({ ...previous, [id]: result.suggested }));
      setNotice(
        result.suggested
          ? `Suggestions sent to ${result.suggested} attendees.`
          : 'No nearby seats available right now. Try again after the next refresh.',
      );
      refresh();
    } catch {
      setNotice(
        'Could not send suggestions. The room may have recovered or suggestions were just sent. Refresh and try again.',
      );
    } finally {
      setPending(undefined);
    }
  };
  return (
    <section className="ops-alerts" aria-labelledby="ops-alert-title">
      <div className="ops-section-heading">
        <h2 id="ops-alert-title">Incident feed</h2>
        <StatusPill tone={alerts.some(a => !a.resolvedAt) ? 'warn' : 'ok'}>
          {alerts.filter((a) => !a.resolvedAt).length} active
        </StatusPill>
      </div>
      <p className="ops-notice" role="status" aria-live="polite">
        {notice}
      </p>
      {alerts.length === 0 ? (
        <p className="ops-empty">No active incidents. Room health is checked every 10 seconds.</p>
      ) : (
        <ol>
          {alerts.slice(0, 20).map((alert) => {
            const room = snapshot.rooms.find((r) => r.room.id === alert.roomId);
            return (
              <Card as="li"
                key={alert.id}
                className={`ops-incident ops-${alert.resolvedAt ? 'ok' : alert.severity}`}
              >
                <StatusPill tone={alert.resolvedAt ? 'ok' : alert.severity}>
                  {alert.resolvedAt
                    ? 'Resolved'
                    : alert.kind === 'overflow'
                      ? 'Capacity incident'
                      : 'Audience signal'}
                </StatusPill>
                <h3>{room?.room.name ?? 'Room'}</h3>
                <p>
                  {alert.kind === 'overflow'
                    ? 'Occupancy reached the 90% threshold.'
                    : alert.kind === 'signal_spike'
                      ? 'Five or more lost or louder signals arrived in 60 seconds.'
                      : 'A facilities issue needs attention.'}
                </p>
                <time dateTime={alert.resolvedAt ?? alert.openedAt}>
                  {formatTime(alert.resolvedAt ?? alert.openedAt, timezone)}
                </time>
                {!alert.resolvedAt && alert.kind === 'overflow' && (
                  <Button block icon="route"
                    type="button"
                    disabled={stale || Boolean(pending) || Boolean(sent[alert.id])}
                    onClick={() => void reroute(alert.id)}
                  >
                    {pending === alert.id
                      ? 'Finding seats…'
                      : sent[alert.id]
                        ? `Sent to ${sent[alert.id]} attendees`
                        : 'Reroute to nearby seats →'}
                  </Button>
                )}
              </Card>
            );
          })}
        </ol>
      )}
    </section>
  );
}
