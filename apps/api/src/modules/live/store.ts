// Live session state. Valkey holds the hot state (captions tail, presence sets, clusters,
// questions, votes, signal window); ES stays the record. Valkey calls go through the core
// client (500 ms command timeout, ioredis auto-instrumented spans).
import type { Redis } from 'ioredis';
import {
  ES_INDICES,
  type Question,
  type QuestionCluster,
  SignalType,
  type RealtimePayload,
  type TokenClaims,
} from '@lanyard/contracts';
import { getContext } from '../../core/context';
import { HttpError } from '../../core/errors';
import { cached, es } from '../../core/es';
import { getRooms } from '../../core/events';

export const CAPTION_TAIL = 30;
export const QUESTION_TAIL = 200;
export const SIGNAL_WINDOW_SEC = 60;

export const SIGNAL_TRIM_SEC = 120;
export const SIGNAL_TYPES = SignalType.options;

// Shared schema (orchestrator 12:33; WS4's ops board and reroute read the first five).
// The `live:*` keys are WS2-private.
export const keys = {
  roomMembers: (roomId: string) => `room:${roomId}:members`, // SET anonId
  sessionMembers: (sid: string) => `session:${sid}:members`, // SET anonId
  attendeeAt: (anonId: string) => `attendee:${anonId}:at`, // HASH eventId roomId sessionId at
  signals: (sid: string, type: string) => `signals:${sid}:${type}`, // ZSET ms -> unique id
  questionCount: (sid: string) => `questions:${sid}:count`, // INT
  seq: (sid: string) => `live:s:${sid}:seq`,
  captions: (sid: string) => `live:s:${sid}:captions`, // LIST newest first, JSON
  clusters: (sid: string) => `live:s:${sid}:clusters`, // SET clusterId
  cluster: (cid: string) => `live:c:${cid}`, // HASH QuestionCluster
  questions: (sid: string) => `live:s:${sid}:questions`, // LIST questionId newest first
  question: (qid: string) => `live:q:${qid}`, // HASH Question
  voters: (qid: string) => `live:q:${qid}:voters`, // SET anonId
  rate: (sid: string, anonId: string, type: string) => `live:rl:${sid}:${anonId}:${type}`,
  conns: (anonId: string) => `live:conns:${anonId}`, // INT open SSE streams
  graceLeft: (anonId: string) => `live:graceleft:${anonId}`, // STRING sessionId left by grace
};

/** The Valkey client; live writes need it (503 when VALKEY_URL is unset). */
export function kv(): Redis {
  const c = getContext().kv;
  if (!c) throw new HttpError(503, 'valkey_unavailable', 'Live state store is not configured');
  return c;
}

export interface LiveSession {
  id: string;
  eventId: string;
  roomId: string;
  status: string;
  capacity: number;
}

type Hit = { _id?: string; _source?: Record<string, unknown> };

/** Session plus its room capacity, cached 30 s (sessions change rarely). */
export function getLiveSession(id: string): Promise<LiveSession> {
  return cached(`live-session:${id}`, async () => {
    const res = await es(ES_INDICES.sessions, 'search', (c, o) =>
      c.search(
        {
          index: ES_INDICES.sessions,
          size: 1,
          _source: ['id', 'eventId', 'roomId', 'status'],
          query: { bool: { should: [{ ids: { values: [id] } }, { term: { id } }] } },
        },
        o,
      ),
    );
    const hit = res.hits.hits[0] as Hit | undefined;
    const src = hit?._source;
    if (!hit || !src) throw new HttpError(404, 'session_not_found', 'No such session');
    const eventId = String(src.eventId ?? '');
    const roomId = String(src.roomId ?? '');
    const rooms = await getRooms(eventId).catch(() => []);
    const capacity = rooms.find((r) => r.id === roomId)?.capacity ?? 0;
    return {
      id: String(src.id ?? hit._id),
      eventId,
      roomId,
      status: String(src.status ?? 'scheduled'),
      capacity,
    };
  });
}

/** Tokens are per event: a token for another event can't touch this session. */
export function assertSameEvent(claims: TokenClaims, s: LiveSession): void {
  if (claims.eventId !== s.eventId)
    throw new HttpError(403, 'forbidden', 'Token is for another event');
}

export type CaptionPayload = RealtimePayload<'caption.appended'> & { endedAt?: string };

export async function readCaptions(r: Redis, sid: string): Promise<CaptionPayload[]> {
  const raw = await r.lrange(keys.captions(sid), 0, CAPTION_TAIL - 1);
  return raw
    .flatMap((s) => {
      try {
        return [JSON.parse(s) as CaptionPayload];
      } catch {
        return [];
      }
    })
    .reverse();
}

export function toQuestion(h: Record<string, string>): Question | undefined {
  if (!h.id) return undefined;
  return {
    id: h.id,
    sessionId: h.sessionId ?? '',
    eventId: h.eventId || undefined,
    anonId: h.anonId ?? '',
    text: h.text ?? '',
    clusterId: h.clusterId ?? h.id,
    votes: Number(h.votes ?? 0),
    status: (h.status ?? 'open') as Question['status'],
    at: h.at ?? new Date(0).toISOString(),
  };
}

export function toCluster(h: Record<string, string>): QuestionCluster | undefined {
  if (!h.id) return undefined;
  return {
    id: h.id,
    sessionId: h.sessionId ?? '',
    label: h.label ?? '',
    size: Number(h.size ?? 0),
    votes: Number(h.votes ?? 0),
    representativeQuestionId: h.representativeQuestionId ?? '',
  };
}

async function hashes(r: Redis, ids: string[], key: (id: string) => string) {
  if (ids.length === 0) return [];
  const p = r.pipeline();
  ids.forEach((id) => p.hgetall(key(id)));
  const out = (await p.exec()) ?? [];
  return out.map(([, v]) => (v ?? {}) as Record<string, string>);
}

export async function readQuestions(r: Redis, sid: string): Promise<Question[]> {
  const ids = await r.lrange(keys.questions(sid), 0, QUESTION_TAIL - 1);
  return (await hashes(r, ids, keys.question)).flatMap((h) => {
    const q = toQuestion(h);
    return q && q.status !== 'hidden' ? [q] : [];
  });
}

export async function readClusters(r: Redis, sid: string): Promise<QuestionCluster[]> {
  const ids = await r.smembers(keys.clusters(sid));
  return (await hashes(r, ids, keys.cluster))
    .flatMap((h) => {
      const c = toCluster(h);
      return c && c.size > 0 ? [c] : [];
    })
    .sort((a, b) => b.votes - a.votes || b.size - a.size);
}

/** Counts per signal type over the last 60 s (ZCOUNT on each `signals:{sid}:{type}`). */
export async function readSignalWindow(
  r: Redis,
  sid: string,
): Promise<Partial<Record<SignalType, number>>> {
  const since = Date.now() - SIGNAL_WINDOW_SEC * 1000;
  const p = r.pipeline();
  SIGNAL_TYPES.forEach((t) => p.zcount(keys.signals(sid, t), since, '+inf'));
  const out = (await p.exec()) ?? [];
  const counts: Partial<Record<SignalType, number>> = {};
  SIGNAL_TYPES.forEach((t, i) => {
    const n = Number(out[i]?.[1] ?? 0);
    if (n > 0) counts[t] = n;
  });
  return counts;
}
