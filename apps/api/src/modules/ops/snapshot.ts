import { Alert, SignalType, type OpsSnapshot } from '@lanyard/contracts';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { ModuleContext } from '../../core/context';
import { HttpError } from '../../core/errors';
import { getNowNext, getRooms } from '../../core/events';

export const alertKey = (eventId: string) => `ops:${eventId}:alerts`;
export type OpsReading = { snapshot: OpsSnapshot; attendees: Map<string, number> };

export function opsUnavailable(ctx: ModuleContext, event: string, message: string): never {
  const span = trace.getActiveSpan();
  span?.recordException({ name: 'OpsStateError', message });
  span?.setStatus({ code: SpanStatusCode.ERROR });
  ctx.logger.warn({ event }, message);
  throw new HttpError(503, 'ops_unavailable', message);
}

export async function readOps(
  ctx: ModuleContext,
  eventId: string,
  at = new Date(),
  load = { getRooms, getNowNext },
): Promise<OpsReading> {
  if (!ctx.kv) throw new HttpError(503, 'ops_unavailable', 'Live state is not configured');
  const [rooms, { now }] = await Promise.all([
    load.getRooms(eventId),
    load.getNowNext(eventId, at),
  ]);
  const iso = at.toISOString();
  const current = rooms.map((room) =>
    now.find((s) => s.roomId === room.id && s.status !== 'ended' && s.endsAt > iso),
  );
  const pipeline = ctx.kv.pipeline().get(alertKey(eventId));
  rooms.forEach((room, i) => {
    pipeline.scard(`room:${room.id}:members`);
    const session = current[i];
    if (!session) return;
    pipeline.scard(`session:${session.id}:members`).get(`questions:${session.id}:count`);
    for (const type of SignalType.options) {
      pipeline.zcount(`signals:${session.id}:${type}`, at.getTime() - 60_000, '+inf');
    }
  });
  let values: unknown[];
  try {
    const results = await pipeline.exec();
    if (!results || results.some(([error]) => error)) throw new Error('state read failed');
    values = results.map(([, value]) => value);
  } catch {
    // Do not leak Redis command arguments (including live-state identifiers).
    opsUnavailable(ctx, eventId, 'Live state is temporarily unavailable');
  }
  let cursor = 0;
  const rawAlerts = values[cursor++];
  let alerts: Alert[] = [];
  try {
    alerts = rawAlerts ? Alert.array().parse(JSON.parse(String(rawAlerts))) : [];
  } catch {
    opsUnavailable(ctx, eventId, 'Invalid live alert state');
  }
  const count = () => {
    const value = Number(values[cursor++]);
    if (!Number.isSafeInteger(value) || value < 0)
      opsUnavailable(ctx, eventId, 'Invalid live count');
    return value;
  };
  const attendees = new Map<string, number>();
  const statuses: OpsSnapshot['rooms'] = rooms.map((room, i) => {
    const occupancy = count();
    const session = current[i];
    const signals: OpsSnapshot['rooms'][number]['signals'] = {};
    let questionCount = 0;
    if (session) {
      attendees.set(session.id, count());
      questionCount = count();
      for (const type of SignalType.options) signals[type] = count();
    }
    return {
      room,
      occupancy,
      sessionId: session?.id,
      signals,
      questionCount,
      // Finite JSON even for a closed, zero-capacity room with occupants.
      ratio: room.capacity > 0 ? occupancy / room.capacity : occupancy > 0 ? 1 : 0,
    };
  });
  return { snapshot: { rooms: statuses, alerts }, attendees };
}
