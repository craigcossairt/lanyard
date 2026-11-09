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
 * After the last one closes, wait 30 s; if none reopened, the attendee leaves their current
 * session. A stream reopened for that session after such a leave rejoins it.
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

/**
 * Last stream close per attendee. Streams rotate every ~12 s (the gateway cuts at 15 s), so
 * a grace timer from an older close can fire inside a later reconnect gap with conns at 0.
 * The leave therefore requires 30 s with no stream at all, measured from the LAST close.
 * (WS0 ownership exception for the SSE P0 fix, approved by the orchestrator.)
 */
const seenKey = (anonId: string) => `live:seen:${anonId}`;

function onAttendeeClose(anonId: string): void {
  void kv()
    .set(seenKey(anonId), String(Date.now()), 'EX', CONNS_TTL_S)
    .catch(() => undefined);
  void (kv().eval(DECR_CLAMP, 1, keys.conns(anonId), CONNS_TTL_S) as Promise<number>)
    .then((n) => {
      if (n > 0) return;
      setTimeout(() => void graceExpired(anonId), GRACE_MS).unref();
    })
    .catch(() => logger.warn('stream close bookkeeping failed'));
}

/**
 * The counter is attendee-wide, so the leave targets the attendee's *current* session
 * (attendee:{anonId}:at), not the session of whichever stream closed last.
 */
async function graceExpired(anonId: string): Promise<void> {
  try {
    const r = kv();
    const [conns, at, seen] = await Promise.all([
      r.get(keys.conns(anonId)),
      r.hget(keys.attendeeAt(anonId), 'sessionId'),
      r.get(seenKey(anonId)),
    ]);
    if (Number(conns ?? 0) > 0 || !at) return;
    // A newer close exists: its own timer decides (no flapping across rotations).
    if (seen && Date.now() - Number(seen) < GRACE_MS - 1_000) return;
    const s = await getLiveSession(at);
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
      let gone = false;
      req.raw.on('close', () => (gone = true));
      // Subscribe first and buffer live messages until the snapshot is out, so nothing
      // published while the snapshot is read gets lost.
      // Message ids are kept so the client's Last-Event-ID keeps advancing.
      let buffer: { m: RealtimeMessage; id?: string }[] | undefined = [];
      const conn = openSse(req, reply, {
        channels: [channels.session(s.id)],
        filter: (msg, _c, id) => {
          if (!buffer) return msg;
          buffer.push({ m: msg, id });
          return undefined;
        },
      });
      // Streams rotate every ~12 s (the gateway cuts at 15 s). A reconnect with a valid
      // Last-Event-ID gets the missed delta replayed by core: no snapshot needed.
      // (WS0 ownership exception: the reconnect-cheapness change, approved by the orchestrator.)
      const resumed = await Promise.race([
        conn.resumed,
        new Promise<boolean>((r) => setTimeout(() => r(false), 2_000)),
      ]);
      if (resumed) {
        const pending = buffer;
        buffer = undefined;
        for (const p of pending) conn.send(p.m.type, p.m, p.id);
      } else {
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
        for (const { m, id } of pending) {
          if (m.type === 'caption.appended' && m.payload.seq <= maxSeq) continue;
          if (m.type === 'question.created' && seen.has(m.payload.questionId)) continue;
          conn.send(m.type, m, id);
        }
      }

      // A client that left while the snapshot was read gets no bookkeeping: its close
      // event has already fired.
      if (!gone && claims.role === 'attendee' && getContext().kv) {
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
          void opened.then((ok) => ok && onAttendeeClose(anonId));
        });
      }
    },
  );
}
