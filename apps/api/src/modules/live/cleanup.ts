// Synthetic-data cleanup for the demo engine (WS4's simulator). Removes ONLY the records
// passed in, and only inside CNH Demos: questions (ES + Valkey + cluster/vote state),
// transcript chunks (ES + caption tail), and the listed anonIds' presence and signals.
// Open screens refresh through question.updated (hidden), cluster.updated,
// attendance.updated and signals.window. No text is logged or published.
import { channels, ES_INDICES, EVENT_IDS, realtime } from '@lanyard/contracts';
import type { Redis } from 'ioredis';
import type { ModuleContext } from '../../core/context';
import { HttpError } from '../../core/errors';
import { es } from '../../core/es';
import {
  getLiveSession,
  keys,
  readQuestions,
  readSignalWindow,
  SIGNAL_TYPES,
  SIGNAL_WINDOW_SEC,
  toCluster,
  toQuestion,
  type LiveSession,
} from './store';

/** What the helper needs from the app context (WS4 passes its ModuleContext). */
export type AppContext = Pick<ModuleContext, 'kv' | 'bus' | 'logger'>;
type Bus = AppContext['bus'];

export interface CleanupInput {
  eventId: 'cnh-demos';
  sessionIds: string[];
  questionIds?: string[];
  chunkIds?: string[];
  anonIds: string[];
}

export interface CleanupResult {
  removed: {
    questions: number; // distinct questions removed (Valkey or ES)
    chunks: number; // transcript chunks removed (ES or caption tail)
    members: number; // room/session set memberships removed
    signals: number; // signal zset entries removed
    votes: number; // sim votes taken off surviving questions
  };
}

const MAX_IDS = 5_000;
const label = (t: string) => (t.length > 80 ? `${t.slice(0, 77)}…` : t);

/** ES delete scoped to these sessions in CNH Demos: (ids OR, for questions, anonIds). */
async function esDelete(
  index: typeof ES_INDICES.questions | typeof ES_INDICES.transcripts,
  sessionIds: string[],
  ids: string[],
  anonIds: string[] = [],
): Promise<number> {
  const should: object[] = [];
  if (ids.length) should.push({ ids: { values: ids } });
  if (anonIds.length) should.push({ terms: { anonId: anonIds } });
  if (should.length === 0) return 0;
  const res = await es(index, 'delete_by_query', (c, o) =>
    c.deleteByQuery(
      {
        index,
        conflicts: 'proceed',
        query: {
          bool: {
            filter: [
              { terms: { sessionId: sessionIds } },
              { term: { eventId: EVENT_IDS.cnhDemos } },
            ],
            should,
            minimum_should_match: 1,
          },
        },
      },
      o,
    ),
  );
  return res.deleted ?? 0;
}

/**
 * Questions by these anonIds, from Valkey (the route writes it first) and ES (covers a
 * Valkey hash that expired), scoped to the listed sessions.
 */
async function discoverQuestions(
  r: Redis,
  sessionIds: string[],
  anonIds: string[],
): Promise<string[]> {
  const anon = new Set(anonIds);
  const found: string[] = [];
  for (const sid of sessionIds) {
    const ids = await r.lrange(keys.questions(sid), 0, -1);
    if (ids.length === 0) continue;
    const p = r.pipeline();
    ids.forEach((id) => p.hget(keys.question(id), 'anonId'));
    const owners = (await p.exec()) ?? [];
    ids.forEach((id, i) => {
      if (anon.has(String(owners[i]?.[1] ?? ''))) found.push(id);
    });
  }
  const res = await es(ES_INDICES.questions, 'search', (c, o) =>
    c.search(
      {
        index: ES_INDICES.questions,
        size: MAX_IDS,
        _source: false,
        query: {
          bool: {
            filter: [
              { terms: { sessionId: sessionIds } },
              { term: { eventId: EVENT_IDS.cnhDemos } },
              { terms: { anonId: anonIds } },
            ],
          },
        },
      },
      o,
    ),
  );
  for (const h of res.hits.hits) if (h._id) found.push(h._id);
  return found;
}

async function removeQuestions(
  r: Redis,
  bus: Bus,
  sessions: Map<string, LiveSession>,
  questionIds: string[],
): Promise<number> {
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

  for (const [cid, gone] of touched) {
    const h = await r.hgetall(keys.cluster(cid));
    const c = toCluster(h);
    if (!c) continue;
    if (c.size <= 0) {
      await r.multi().del(keys.cluster(cid)).srem(keys.clusters(c.sessionId), cid).exec();
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
  return [...removedBySession.values()].reduce((a, b) => a + b, 0);
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
  bus: Bus,
  sessions: Map<string, LiveSession>,
  anonIds: string[],
): Promise<{ members: number; signals: number }> {
  const anon = new Set(anonIds);
  let members = 0;
  let signals = 0;
  for (const s of sessions.values()) {
    const m = r.multi();
    m.srem(keys.sessionMembers(s.id), ...anonIds);
    m.srem(keys.roomMembers(s.roomId), ...anonIds);
    const res = (await m.exec()) ?? [];
    members += res.reduce((n, [, v]) => n + Number(v ?? 0), 0);

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
  return { members, signals };
}

/**
 * Take sim votes off surviving (real) questions. KEYS: voters, question, cluster. ARGV:
 * anonIds. Returns {removedVotes, questionVotes, clusterVotes} (cluster -1 if absent).
 */
const UNVOTE = `local n = redis.call('SREM', KEYS[1], unpack(ARGV))
if n == 0 then return {0, 0, -1} end
local qv = redis.call('HINCRBY', KEYS[2], 'votes', -n)
local cv = -1
if redis.call('HGET', KEYS[2], 'status') ~= 'hidden' and redis.call('EXISTS', KEYS[3]) == 1 then
  cv = redis.call('HINCRBY', KEYS[3], 'votes', -n)
end
return {n, qv, cv}`;

async function removeVotes(
  r: Redis,
  bus: Bus,
  sessionIds: string[],
  anonIds: string[],
): Promise<number> {
  let removed = 0;
  for (const sid of sessionIds) {
    for (const qid of await r.lrange(keys.questions(sid), 0, -1)) {
      const h = await r.hgetall(keys.question(qid));
      const q = toQuestion(h);
      if (!q) continue;
      const [n, qv, cv] = (await r.eval(
        UNVOTE,
        3,
        keys.voters(qid),
        keys.question(qid),
        keys.cluster(q.clusterId),
        ...anonIds,
      )) as [number, number, number];
      if (n === 0) continue;
      removed += n;
      await bus.publish(
        channels.session(sid),
        realtime('question.updated', {
          questionId: q.id,
          clusterId: q.clusterId,
          votes: Math.max(0, qv),
          status: q.status,
          text: q.status === 'hidden' ? undefined : q.text,
        }),
      );
      if (cv >= 0) {
        const c = toCluster(await r.hgetall(keys.cluster(q.clusterId)));
        if (c)
          await bus.publish(
            channels.session(sid),
            realtime('cluster.updated', {
              clusterId: c.id,
              label: c.label,
              size: c.size,
              votes: Math.max(0, c.votes),
            }),
          );
      }
    }
  }
  return removed;
}

/**
 * Remove the listed synthetic CNH Demos records, plus any question by the listed anonIds in
 * these sessions (covers a crash between the route write and the caller's ledger save).
 * Throws unless eventId is cnh-demos and every session is in cnh-demos.
 */
export async function cleanupSynthetic(
  ctx: AppContext,
  input: CleanupInput,
): Promise<CleanupResult> {
  // Runtime check too: callers may not be typed.
  if ((input.eventId as string) !== EVENT_IDS.cnhDemos)
    throw new HttpError(403, 'forbidden', 'cleanupSynthetic only runs on cnh-demos');
  const questionIds = input.questionIds ?? [];
  const anonIds = input.anonIds ?? [];
  let chunkIds = input.chunkIds ?? [];
  if ([input.sessionIds, questionIds, chunkIds, anonIds].some((a) => a.length > MAX_IDS))
    throw new HttpError(400, 'too_many_ids', `At most ${MAX_IDS} ids per list`);

  const removed: CleanupResult['removed'] = {
    questions: 0,
    chunks: 0,
    members: 0,
    signals: 0,
    votes: 0,
  };
  if (input.sessionIds.length === 0) return { removed };
  const r = ctx.kv;
  if (!r) throw new HttpError(503, 'valkey_unavailable', 'Live state store is not configured');

  // Every session must belong to CNH Demos (second guard against a wrong id list).
  const sessions = new Map<string, LiveSession>();
  for (const sid of new Set(input.sessionIds)) {
    const s = await getLiveSession(sid);
    if (s.eventId !== EVENT_IDS.cnhDemos)
      throw new HttpError(403, 'forbidden', 'Session is not in cnh-demos');
    sessions.set(sid, s);
  }
  const sids = [...sessions.keys()];

  const discovered = anonIds.length ? await discoverQuestions(r, sids, anonIds) : [];
  const allQuestions = [...new Set([...questionIds, ...discovered])];
  if (allQuestions.length) {
    const fromValkey = await removeQuestions(r, ctx.bus, sessions, allQuestions);
    const fromEs = await esDelete(ES_INDICES.questions, sids, questionIds, anonIds);
    removed.questions = Math.max(fromValkey, fromEs);
  }
  // Chunks a simulated speaker published (ledger written before publish).
  const ledger = anonIds.filter((a) => a.startsWith('sim_')).map((a) => keys.syntheticChunks(a));
  if (ledger.length) chunkIds = [...new Set([...chunkIds, ...(await r.sunion(...ledger))])];
  if (chunkIds.length) {
    const fromTail = await removeCaptions(r, sids, chunkIds);
    const fromEs = await esDelete(ES_INDICES.transcripts, sids, chunkIds);
    removed.chunks = Math.max(fromTail, fromEs);
  }
  if (anonIds.length) {
    Object.assign(removed, await removeAttendees(r, ctx.bus, sessions, anonIds));
    // Sim votes on real questions (dedup can merge a sim question into a real cluster).
    removed.votes = await removeVotes(r, ctx.bus, sids, anonIds);
    if (ledger.length) await r.del(...ledger);
  }

  ctx.logger.info({ eventId: input.eventId, removed }, 'synthetic cleanup');
  return { removed };
}
