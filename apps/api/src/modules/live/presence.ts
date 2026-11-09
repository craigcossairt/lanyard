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

/** Apply one presence change and publish attendance; returns the session count. */
export async function applyPresence(
  s: LiveSession,
  anonId: string,
  kind: z.infer<typeof PresenceKind>,
): Promise<{ count: number; capacity: number }> {
  const r = kv();
  const prev = await r.hgetall(keys.attendeeAt(anonId));
  const m = r.multi();
  if (kind === 'leave') {
    m.srem(keys.sessionMembers(s.id), anonId);
    // Room and attendee:at follow the current session only: a late leave for an earlier
    // session in the same room must not drop the attendee from that room.
    const current = !prev.sessionId || prev.sessionId === s.id;
    if (current) {
      m.srem(keys.roomMembers(s.roomId), anonId);
      m.del(keys.attendeeAt(anonId));
    }
  } else {
    if (prev.sessionId && prev.sessionId !== s.id)
      m.srem(keys.sessionMembers(prev.sessionId), anonId);
    if (prev.roomId && prev.roomId !== s.roomId) m.srem(keys.roomMembers(prev.roomId), anonId);
    m.sadd(keys.sessionMembers(s.id), anonId);
    m.sadd(keys.roomMembers(s.roomId), anonId);
    m.hset(keys.attendeeAt(anonId), {
      eventId: s.eventId,
      roomId: s.roomId,
      sessionId: s.id,
      at: new Date().toISOString(),
    });
    m.expire(keys.attendeeAt(anonId), ATTENDEE_TTL_S);
  }
  m.scard(keys.sessionMembers(s.id));
  const res = (await m.exec()) ?? [];
  const count = Number(res[res.length - 1]?.[1] ?? 0);

  recordPresence(s, anonId, kind);
  await publishAttendance(s, count);

  // Moved from another session: its attendance dropped by one.
  if (kind !== 'leave' && prev.sessionId && prev.sessionId !== s.id) {
    const old = await getLiveSession(prev.sessionId).catch(() => undefined);
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
