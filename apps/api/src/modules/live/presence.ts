// POST /api/sessions/:id/presence (attendee): join / checkin / leave.
// Valkey sets are the live counters (room:{roomId}:members, session:{sid}:members,
// attendee:{anonId}:at); ES cnh-presence is the record. Joining a session in another room
// moves the attendee. An SSE disconnect counts as leave after a 30 s grace (see stream.ts).
import type { FastifyInstance } from 'fastify';
import {
  channels,
  ES_INDICES,
  PresenceRequest,
  realtime,
  type PresenceKind,
} from '@lanyard/contracts';
import type { z } from 'zod';
import { authOf, requireRole } from '../../core/auth';
import { getBus } from '../../core/context';
import { parse } from '../../core/errors';
import { es } from '../../core/es';
import { logger } from '../../core/logger';
import { assertSameEvent, getLiveSession, keys, kv, type LiveSession } from './store';

const ATTENDEE_TTL_S = 24 * 3600;

async function publishAttendance(s: LiveSession, count: number): Promise<void> {
  const msg = realtime('attendance.updated', {
    sessionId: s.id,
    roomId: s.roomId,
    count,
    capacity: s.capacity,
  });
  const bus = getBus();
  await Promise.all([
    bus.publish(channels.session(s.id), msg),
    bus.publish(channels.ops(s.eventId), msg),
  ]);
}

function recordPresence(s: LiveSession, anonId: string, kind: z.infer<typeof PresenceKind>) {
  const doc = {
    anonId,
    eventId: s.eventId,
    roomId: s.roomId,
    sessionId: s.id,
    kind,
    at: new Date().toISOString(),
  };
  // The record is not on the hot path: Valkey already answered. Errors stay on the span.
  es(ES_INDICES.presence, 'index', (c, o) =>
    c.index({ index: ES_INDICES.presence, document: doc }, o),
  ).catch(() => logger.warn({ kind }, 'presence record failed'));
}

/**
 * One atomic presence change, so overlapping joins can't leave the attendee in two places.
 * KEYS: attendee:{anonId}:at, session:{sid}:members, room:{roomId}:members (targets).
 * ARGV: anonId, kind, sessionId, roomId, eventId, at, ttl. The previous location's keys
 * are rebuilt here with the same `session:{id}:members` / `room:{id}:members` shape as
 * store.ts. A leave for an older session touches only that session's set; room and
 * attendee:at follow the current session. Returns {sessionCount, previousSessionId}.
 */
const PRESENCE = `local a = ARGV[1]
local prevS = redis.call('HGET', KEYS[1], 'sessionId') or ''
local prevR = redis.call('HGET', KEYS[1], 'roomId') or ''
if ARGV[2] == 'leave' then
  redis.call('SREM', KEYS[2], a)
  if prevS == '' or prevS == ARGV[3] then
    redis.call('SREM', KEYS[3], a)
    redis.call('DEL', KEYS[1])
  end
else
  if prevS ~= '' and prevS ~= ARGV[3] then redis.call('SREM', 'session:' .. prevS .. ':members', a) end
  if prevR ~= '' and prevR ~= ARGV[4] then redis.call('SREM', 'room:' .. prevR .. ':members', a) end
  redis.call('SADD', KEYS[2], a)
  redis.call('SADD', KEYS[3], a)
  redis.call('HSET', KEYS[1], 'eventId', ARGV[5], 'roomId', ARGV[4], 'sessionId', ARGV[3], 'at', ARGV[6])
  redis.call('EXPIRE', KEYS[1], ARGV[7])
end
return {redis.call('SCARD', KEYS[2]), prevS}`;

/** Apply one presence change and publish attendance; returns the session count. */
export async function applyPresence(
  s: LiveSession,
  anonId: string,
  kind: z.infer<typeof PresenceKind>,
): Promise<{ count: number; capacity: number }> {
  const r = kv();
  const [count, prevSession] = (await r.eval(
    PRESENCE,
    3,
    keys.attendeeAt(anonId),
    keys.sessionMembers(s.id),
    keys.roomMembers(s.roomId),
    anonId,
    kind,
    s.id,
    s.roomId,
    s.eventId,
    new Date().toISOString(),
    ATTENDEE_TTL_S,
  )) as [number, string];

  recordPresence(s, anonId, kind);
  await publishAttendance(s, count);

  // Moved from another session: its attendance dropped by one.
  if (kind !== 'leave' && prevSession && prevSession !== s.id) {
    const old = await getLiveSession(prevSession).catch(() => undefined);
    if (old) await publishAttendance(old, await r.scard(keys.sessionMembers(old.id)));
  }
  return { count, capacity: s.capacity };
}

export function registerPresence(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>(
    '/sessions/:id/presence',
    { preHandler: requireRole('attendee') },
    async (req) => {
      const claims = authOf(req);
      const body = parse(PresenceRequest, req.body ?? {});
      const s = await getLiveSession(req.params.id);
      assertSameEvent(claims, s);
      return applyPresence(s, claims.sub, body.kind);
    },
  );
}
