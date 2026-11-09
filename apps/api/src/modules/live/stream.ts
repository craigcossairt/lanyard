// GET /api/sessions/:id/stream (any role). SSE via the core helper (fetch + Bearer, plus
// the caller's user channel). First event after `ready` is `snapshot`; then live messages.
import type { FastifyInstance } from 'fastify';
import { channels, type Question, type QuestionCluster } from '@lanyard/contracts';
import { authOf, requireAuth } from '../../core/auth';
import { getContext } from '../../core/context';
import { logger } from '../../core/logger';
import { openSse } from '../../core/sse';
import { applyPresence } from './presence';
import {
  assertSameEvent,
  getLiveSession,
  kv,
  readCaptions,
  readClusters,
  readQuestions,
  readSignalWindow,
  keys,
  SIGNAL_WINDOW_SEC,
  type CaptionPayload,
  type LiveSession,
} from './store';

/** Body of the `snapshot` SSE event (sent on every connect and reconnect). */
export interface LiveSnapshot {
  type: 'snapshot';
  at: string;
  payload: {
    sessionId: string;
    roomId: string;
    status: string;
    captions: CaptionPayload[];
    questions: Question[];
    clusters: QuestionCluster[];
    signals: {
      sessionId: string;
      roomId: string;
      windowSec: number;
      counts: Record<string, number>;
    };
    attendance: { sessionId: string; roomId: string; count: number; capacity: number };
  };
}

export async function buildSnapshot(s: LiveSession): Promise<LiveSnapshot> {
  const r = getContext().kv;
  const [captions, questions, clusters, counts, count] = r
    ? await Promise.all([
        readCaptions(r, s.id),
        readQuestions(r, s.id),
        readClusters(r, s.id),
        readSignalWindow(r, s.id),
        r.scard(keys.sessionMembers(s.id)),
      ])
    : [[], [], [], {}, 0];
  return {
    type: 'snapshot',
    at: new Date().toISOString(),
    payload: {
      sessionId: s.id,
      roomId: s.roomId,
      status: s.status,
      captions,
      questions,
      clusters,
      signals: { sessionId: s.id, roomId: s.roomId, windowSec: SIGNAL_WINDOW_SEC, counts },
      attendance: { sessionId: s.id, roomId: s.roomId, count, capacity: s.capacity },
    },
  };
}

const GRACE_MS = 30_000;
const CONNS_TTL_S = 3600;

/**
 * Attendee stream bookkeeping: `live:conns:{anonId}` counts open streams across pods.
 * After the last one closes, wait 30 s; if none reopened and the attendee is still in this
 * session, that's a leave. A stream reopened after such a leave rejoins the session.
 */
async function onAttendeeOpen(s: LiveSession, anonId: string): Promise<void> {
  const res = await kv()
    .multi()
    .incr(keys.conns(anonId))
    .expire(keys.conns(anonId), CONNS_TTL_S)
    .getdel(keys.graceLeft(anonId))
    .exec();
  const left = res?.[2]?.[1];
  if (left === s.id) await applyPresence(s, anonId, 'join');
}

function onAttendeeClose(s: LiveSession, anonId: string): void {
  const r = kv();
  void r
    .decr(keys.conns(anonId))
    .then((n) => {
      if (n > 0) return;
      setTimeout(() => void graceExpired(s, anonId), GRACE_MS).unref();
    })
    .catch(() => logger.warn('stream close bookkeeping failed'));
}

async function graceExpired(s: LiveSession, anonId: string): Promise<void> {
  try {
    const r = kv();
    const [conns, at] = await Promise.all([
      r.get(keys.conns(anonId)),
      r.hget(keys.attendeeAt(anonId), 'sessionId'),
    ]);
    if (Number(conns ?? 0) > 0 || at !== s.id) return;
    await applyPresence(s, anonId, 'leave');
    await r.set(keys.graceLeft(anonId), s.id, 'EX', CONNS_TTL_S);
  } catch {
    logger.warn('grace leave failed');
  }
}

export function registerStream(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    '/sessions/:id/stream',
    { preHandler: requireAuth() },
    async (req, reply) => {
      const claims = authOf(req);
      const s = await getLiveSession(req.params.id);
      assertSameEvent(claims, s);
      // Build the snapshot before hijacking, so failures still get a JSON error status.
      const snap = await buildSnapshot(s);
      const conn = openSse(req, reply, { channels: [channels.session(s.id)] });
      conn.send('snapshot', snap);
      if (claims.role === 'attendee' && getContext().kv) {
        const opened = onAttendeeOpen(s, claims.sub).catch(() =>
          logger.warn('stream open bookkeeping failed'),
        );
        // Decrement only after the increment landed.
        req.raw.on('close', () => void opened.then(() => onAttendeeClose(s, claims.sub)));
      }
    },
  );
}
