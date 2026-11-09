import { randomUUID } from 'node:crypto';
import type { Alert, OpsSnapshot, RealtimeMessage } from '@lanyard/contracts';

export const OVERFLOW_RATIO = 0.9;
export const SIGNAL_SPIKE_COUNT = 5;

/** Pure transition rules: publish only edges, preserve open incident identity. */
export function evaluateAlerts(
  eventId: string,
  rooms: OpsSnapshot['rooms'],
  previous: Alert[],
  at: string,
): { alerts: Alert[]; transitions: RealtimeMessage[] } {
  const active = new Map<string, Pick<Alert, 'roomId' | 'kind' | 'severity'>>();
  for (const room of rooms) {
    if (room.occupancy > 0 && (room.room.capacity === 0 || room.ratio >= OVERFLOW_RATIO)) {
      active.set(`${room.room.id}:overflow`, {
        roomId: room.room.id,
        kind: 'overflow',
        severity: 'crit',
      });
    }
    if (
      (room.signals.lost ?? 0) >= SIGNAL_SPIKE_COUNT ||
      (room.signals.louder ?? 0) >= SIGNAL_SPIKE_COUNT
    ) {
      active.set(`${room.room.id}:signal_spike`, {
        roomId: room.room.id,
        kind: 'signal_spike',
        severity: 'warn',
      });
    }
  }
  const transitions: RealtimeMessage[] = [];
  const alerts = previous.map((alert) => {
    if (alert.resolvedAt) return alert;
    if (active.delete(`${alert.roomId}:${alert.kind}`)) return alert;
    const resolved = { ...alert, resolvedAt: at };
    transitions.push({ type: 'alert.resolved', at, payload: resolved });
    return resolved;
  });
  for (const rule of active.values()) {
    const alert: Alert = { ...rule, id: randomUUID(), eventId, openedAt: at };
    alerts.push(alert);
    transitions.push({ type: 'alert.opened', at, payload: alert });
  }
  // Keep every active incident and a bounded feed of the 50 most recent resolutions.
  const resolved = alerts.filter((a) => a.resolvedAt).slice(-50);
  return { alerts: [...resolved, ...alerts.filter((a) => !a.resolvedAt)], transitions };
}
