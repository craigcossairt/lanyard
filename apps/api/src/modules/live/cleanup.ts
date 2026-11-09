// Synthetic-data cleanup for the demo engine (WS4's simulator). Removes ONLY the records
// passed in, and only inside CNH Demos: questions (ES + Valkey + cluster/vote state),
// transcript chunks (ES + caption tail), and the listed anonIds' presence and signals.
// Open screens refresh through question.updated (hidden), cluster.updated,
// attendance.updated and signals.window. No text is logged or published.
import { channels, ES_INDICES, EVENT_IDS, realtime } from '@lanyard/contracts';
import type { Redis } from 'ioredis';
import { getBus } from '../../core/context';
import { HttpError } from '../../core/errors';
import { es } from '../../core/es';
import { logger } from '../../core/logger';
import {
  getLiveSession,
  keys,
  kv,
  readQuestions,
  readSignalWindow,
  SIGNAL_TYPES,
  SIGNAL_WINDOW_SEC,
  toCluster,
  toQuestion,
  type LiveSession,
} from './store';

export interface CleanupInput {
  eventId: string;
  sessionIds: string[];
  questionIds?: string[];
  chunkIds?: string[];
  anonIds?: string[];
}

export interface CleanupResult {
  removed: {
    questions: number; // Valkey question records
    esQuestions: number;
    esTranscripts: number;
    captions: number; // caption tail entries
    clusters: number; // clusters emptied and deleted
    presence: number; // set memberships removed
    signals: number; // zset entries removed
  };
}

const MAX_IDS = 5_000;
const label = (t: string) => (t.length > 80 ? `${t.slice(0, 77)}…` : t);

async function esDeleteByIds(
  index: typeof ES_INDICES.questions | typeof ES_INDICES.transcripts,
  ids: string[],
  sessionIds: string[],
): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const batch = ids.slice(i, i + 500);
    // ids AND session AND event: a wrong id can't touch another event's data.
    const res = await es(index, 'delete_by_query', (c, o) =>
      c.deleteByQuery(
        {
          index,
          conflicts: 'proceed',
          query: {
            bool: {
              filter: [
                { ids: { values: batch } },
                { terms: { sessionId: sessionIds } },
                { term: { eventId: EVENT_IDS.cnhDemos } },
              ],
            },
          },
        },
        o,
      ),
    );
    deleted += res.deleted ?? 0;
  }
  return deleted;
}

async function removeQuestions(
  r: Redis,
  sessions: Map<string, LiveSession>,
  questionIds: string[],
): Promise<{ questions: number; clusters: number }> {
  const bus = getBus();
  const removedBySession = new Map<string, number>();
  const touched = new Map<string, Set<string>>(); // clusterId -> removed question ids
  for (const qid of questionIds) {
    const q = toQuestion(await r.hgetall(keys.question(qid)));
    if (!q || !sessions.has(q.sessionId)) continue; // not ours: leave it alone
    const m = r.multi();
    if (q.status !== 'hidden') {
      m.hincrby(keys.cluster(q.clusterId), 'size', -1);
      m.hincrby(keys.cluster(q.clusterId), 'votes', -q.votes);
    }
    m.del(keys.question(qid), keys.voters(qid));
    m.lrem(keys.questions(q.sessionId), 0, qid);
    await m.exec();
    removedBySession.set(q.sessionId, (removedBySession.get(q.sessionId) ?? 0) + 1);
    if (!touched.has(q.clusterId)) touched.set(q.clusterId, new Set());
    touched.get(q.clusterId)!.add(qid);
    await bus.publish(
      channels.session(q.sessionId),
      realtime('question.updated', {
        questionId: q.id,
        clusterId: q.clusterId,
        votes: q.votes,
        status: 'hidden',
      }),
    );
  }

  for (const [sid, n] of removedBySession) {
    const left = await r.decrby(keys.questionCount(sid), n);
    if (left < 0) await r.set(keys.questionCount(sid), 0);
  }

  let clusters = 0;
  for (const [cid, gone] of touched) {
    const h = await r.hgetall(keys.cluster(cid));
    const c = toCluster(h);
    if (!c) continue;
    if (c.size <= 0) {
      await r.multi().del(keys.cluster(cid)).srem(keys.clusters(c.sessionId), cid).exec();
      clusters++;
      await bus.publish(
        channels.session(c.sessionId),
        realtime('cluster.updated', { clusterId: cid, label: '', size: 0, votes: 0 }),
      );
      continue;
    }
    // The representative or label came from a removed question: hand both to the
    // most-voted remaining member.
    const labelIds = (h.labelIds ?? '').split(',');
    const fromGone =
      gone.has(h.labelFrom ?? '') || (h.labelFrom === 'llm' && labelIds.some((id) => gone.has(id)));
    if (gone.has(c.representativeQuestionId) || fromGone) {
      const best = (await readQuestions(r, c.sessionId))
        .filter((q) => q.clusterId === cid)
        .sort((a, b) => b.votes - a.votes)[0];
      const patch: Record<string, string> = {};
      if (gone.has(c.representativeQuestionId))
        patch.representativeQuestionId = c.representativeQuestionId = best?.id ?? '';
      if (fromGone) {
        patch.label = c.label = best ? label(best.text) : '';
        patch.labelFrom = best?.id ?? '';
        patch.labelIds = '';
      }
      await r.hset(keys.cluster(cid), patch);
    }
    await bus.publish(
      channels.session(c.sessionId),
      realtime('cluster.updated', { clusterId: cid, label: c.label, size: c.size, votes: c.votes }),
    );
  }
  const questions = [...removedBySession.values()].reduce((a, b) => a + b, 0);
  return { questions, clusters };
}

async function removeCaptions(r: Redis, sessionIds: string[], chunkIds: string[]) {
  const want = new Set(chunkIds);
  let removed = 0;
  for (const sid of sessionIds) {
    for (const raw of await r.lrange(keys.captions(sid), 0, -1)) {
      let id: string | undefined;
      try {
        id = (JSON.parse(raw) as { chunkId?: string }).chunkId;
      } catch {
        continue;
      }
      if (id && want.has(id)) removed += await r.lrem(keys.captions(sid), 0, raw);
    }
  }
  return removed;
}

async function removeAttendees(
  r: Redis,
  sessions: Map<string, LiveSession>,
  anonIds: string[],
): Promise<{ presence: number; signals: number }> {
  const anon = new Set(anonIds);
  const bus = getBus();
  let presence = 0;
  let signals = 0;
  for (const s of sessions.values()) {
    const m = r.multi();
    m.srem(keys.sessionMembers(s.id), ...anonIds);
    m.srem(keys.roomMembers(s.roomId), ...anonIds);
    const res = (await m.exec()) ?? [];
    presence += res.reduce((n, [, v]) => n + Number(v ?? 0), 0);

    for (const type of SIGNAL_TYPES) {
      const key = keys.signals(s.id, type);
      // Members are `${anonId}:${ms}`; the zset is trimmed to 120 s, so this is small.
      const mine = (await r.zrange(key, '0', '-1')).filter((mem) =>
        anon.has(mem.slice(0, mem.lastIndexOf(':'))),
      );
      if (mine.length) signals += await r.zrem(key, ...mine);
    }
    const count = await r.scard(keys.sessionMembers(s.id));
    const msg = realtime('attendance.updated', {
      sessionId: s.id,
      roomId: s.roomId,
      count,
      capacity: s.capacity,
    });
    const win = realtime('signals.window', {
      sessionId: s.id,
      roomId: s.roomId,
      windowSec: SIGNAL_WINDOW_SEC,
      counts: await readSignalWindow(r, s.id),
    });
    await Promise.all([
      bus.publish(channels.session(s.id), msg),
      bus.publish(channels.ops(s.eventId), msg),
      bus.publish(channels.session(s.id), win),
      bus.publish(channels.ops(s.eventId), win),
    ]);
  }
  // Per-attendee keys, only where they point at one of these sessions.
  for (const a of anonIds) {
    const at = await r.hget(keys.attendeeAt(a), 'sessionId');
    const m = r.multi().del(keys.conns(a), keys.graceLeft(a));
    if (at && sessions.has(at)) m.del(keys.attendeeAt(a));
    for (const s of sessions.values()) for (const t of SIGNAL_TYPES) m.del(keys.rate(s.id, a, t));
    await m.exec();
  }
  return { presence, signals };
}

/** Remove the listed synthetic CNH Demos records. Throws for any other event. */
export async function cleanupSynthetic(input: CleanupInput): Promise<CleanupResult> {
  if (input.eventId !== EVENT_IDS.cnhDemos)
    throw new HttpError(403, 'forbidden', 'cleanupSynthetic only runs on cnh-demos');
  const questionIds = input.questionIds ?? [];
  const chunkIds = input.chunkIds ?? [];
  const anonIds = input.anonIds ?? [];
  if ([input.sessionIds, questionIds, chunkIds, anonIds].some((a) => a.length > MAX_IDS))
    throw new HttpError(400, 'too_many_ids', `At most ${MAX_IDS} ids per list`);

  // Every session must belong to CNH Demos (second guard against a wrong id list).
  const sessions = new Map<string, LiveSession>();
  for (const sid of new Set(input.sessionIds)) {
    const s = await getLiveSession(sid);
    if (s.eventId !== EVENT_IDS.cnhDemos)
      throw new HttpError(403, 'forbidden', 'Session is not in cnh-demos');
    sessions.set(sid, s);
  }
  const sids = [...sessions.keys()];
  const removed: CleanupResult['removed'] = {
    questions: 0,
    esQuestions: 0,
    esTranscripts: 0,
    captions: 0,
    clusters: 0,
    presence: 0,
    signals: 0,
  };
  if (sids.length === 0) return { removed };
  const r = kv();

  if (questionIds.length) {
    Object.assign(removed, await removeQuestions(r, sessions, questionIds));
    removed.esQuestions = await esDeleteByIds(ES_INDICES.questions, questionIds, sids);
  }
  if (chunkIds.length) {
    removed.captions = await removeCaptions(r, sids, chunkIds);
    removed.esTranscripts = await esDeleteByIds(ES_INDICES.transcripts, chunkIds, sids);
  }
  if (anonIds.length) Object.assign(removed, await removeAttendees(r, sessions, anonIds));

  logger.info({ eventId: input.eventId, removed }, 'synthetic cleanup');
  return { removed };
}
