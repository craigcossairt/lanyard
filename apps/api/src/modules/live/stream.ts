// GET /api/sessions/:id/stream (any role). SSE via the core helper (fetch + Bearer, plus
// the caller's user channel). First event after `ready` is `snapshot`; then live messages.
import type { FastifyInstance } from 'fastify';
import {
  channels,
  type Question,
  type QuestionCluster,
  type RealtimeMessage,
} from '@lanyard/contracts';
import { authOf, requireAuth } from '../../core/auth';
import { getBus, getContext } from '../../core/context';
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
  if (left === s.id) await applyPresence(s, anonId, 'join').catch(() => undefined);
}

/** Atomic DECR clamped at 0 (DEL at zero), TTL refreshed while streams remain. */
const DECR_CLAMP = `local n = redis.call('DECR', KEYS[1])
if n <= 0 then redis.call('DEL', KEYS[1]) return 0 end
redis.call('EXPIRE', KEYS[1], ARGV[1]) return n`;

function onAttendeeClose(s: LiveSession, anonId: string): void {
  void (kv().eval(DECR_CLAMP, 1, keys.conns(anonId), CONNS_TTL_S) as Promise<number>)
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
      // Subscribe first and buffer live messages until the snapshot is out, so nothing
      // published while the snapshot is read gets lost.
      let buffer: RealtimeMessage[] | undefined = [];
      const conn = openSse(req, reply, {
        channels: [channels.session(s.id)],
        filter: (msg) => {
          if (!buffer) return msg;
          buffer.push(msg);
          return undefined;
        },
      });
      // Read state only once the session channel is live on Valkey (max 2 s), so the
      // buffer above covers everything published after the snapshot's reads.
      const probe = getBus().subscribe(channels.session(s.id), () => {});
      await Promise.race([probe.ready, new Promise((r) => setTimeout(r, 2_000))]);
      probe();
      let snap: LiveSnapshot;
      try {
        snap = await buildSnapshot(s);
      } catch {
        conn.send('error', { error: { code: 'snapshot_failed', message: 'Retry shortly' } });
        conn.close();
        return;
      }
      conn.send('snapshot', snap);
      const pending = buffer;
      buffer = undefined;
      // Drop buffered messages the snapshot already contains.
      const maxSeq = Math.max(-1, ...snap.payload.captions.map((c) => c.seq));
      const seen = new Set(snap.payload.questions.map((q) => q.id));
      for (const m of pending) {
        if (m.type === 'caption.appended' && m.payload.seq <= maxSeq) continue;
        if (m.type === 'question.created' && seen.has(m.payload.questionId)) continue;
        conn.send(m.type, m);
      }

      if (claims.role === 'attendee' && getContext().kv) {
        const anonId = claims.sub;
        const r = kv();
        const opened = onAttendeeOpen(s, anonId).then(
          () => true,
          () => (logger.warn('stream open bookkeeping failed'), false),
        );
        // Keep the open-stream counter alive for streams longer than its TTL.
        const refresh = setInterval(
          () => void r.expire(keys.conns(anonId), CONNS_TTL_S).catch(() => undefined),
          (CONNS_TTL_S * 1000) / 3,
        ).unref();
        req.raw.on('close', () => {
          clearInterval(refresh);
          // Decrement only if the increment landed.
          void opened.then((ok) => ok && onAttendeeClose(s, anonId));
        });
      }
    },
  );
}
