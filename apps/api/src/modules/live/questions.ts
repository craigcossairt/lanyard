// Questions: POST /sessions/:id/questions (attendee), POST /questions/:id/vote (attendee),
// PATCH /questions/:id (speaker). Flow on ask: Jev moderation + intent (core wrapper) and
// WS1 duplicate search in parallel, then join or open a cluster in Valkey, record in ES
// cnh-questions, publish question.created + cluster.updated. Text never leaves payloads.
import type { FastifyInstance } from 'fastify';
import { metrics } from '@opentelemetry/api';
import {
  AskQuestionRequest,
  channels,
  ES_INDICES,
  METRICS,
  PatchQuestionRequest,
  realtime,
  type AskQuestionResponse,
  type Question,
  type QuestionCluster,
} from '@lanyard/contracts';
import { authOf, requireRole } from '../../core/auth';
import { getBus } from '../../core/context';
import { HttpError, parse } from '../../core/errors';
import { es } from '../../core/es';
import { decide, moderate } from '../../core/jev';
import { logger } from '../../core/logger';
import { newId } from '../../core/tokens';
import { findQuestionCluster } from './similarity';
import {
  assertSameEvent,
  getLiveSession,
  keys,
  kv,
  readQuestions,
  toCluster,
  toQuestion,
} from './store';

const meter = metrics.getMeter('lanyard');
const questionsCounter = meter.createCounter(METRICS.questions);
const dedupCounter = meter.createCounter(METRICS.questionDedup);

const INTENTS = ['clarification', 'deep_dive', 'off_topic'] as const;
/** Provisional label until the worker's LLM label lands: the first question, trimmed. */
const provisionalLabel = (text: string) => (text.length > 80 ? `${text.slice(0, 77)}…` : text);

function publishQuestion(type: 'question.created' | 'question.updated', q: Question) {
  return getBus().publish(
    channels.session(q.sessionId),
    realtime(type, {
      questionId: q.id,
      clusterId: q.clusterId,
      votes: q.votes,
      status: q.status,
      text: q.status === 'hidden' ? undefined : q.text,
    }),
  );
}

function publishCluster(c: QuestionCluster) {
  return getBus().publish(
    channels.session(c.sessionId),
    realtime('cluster.updated', { clusterId: c.id, label: c.label, size: c.size, votes: c.votes }),
  );
}

/**
 * Write the ES record (WS1's dedup corpus) off the hot path; Valkey holds the live value.
 * Each write carries the full current state and a Valkey-side version (external
 * versioning), so a delayed or reordered write can never overwrite a newer one.
 */
function recordQuestion(qid: string): void {
  void kv()
    .multi()
    .hincrby(keys.question(qid), 'ver', 1)
    .hgetall(keys.question(qid))
    .exec()
    .then((res) => {
      const version = Number(res?.[0]?.[1]);
      const h = (res?.[1]?.[1] ?? {}) as Record<string, string>;
      const q = toQuestion(h);
      if (!q || !version) return;
      return es(ES_INDICES.questions, 'index', (c, o) =>
        c.index(
          {
            index: ES_INDICES.questions,
            id: qid,
            version,
            version_type: 'external',
            document: { ...q, intent: h.intent },
          },
          o,
        ),
      );
    })
    .catch(() => logger.warn('question record failed (or superseded)'));
}

async function loadQuestion(qid: string): Promise<Question> {
  const q = toQuestion(await kv().hgetall(keys.question(qid)));
  if (!q) throw new HttpError(404, 'question_not_found', 'No such question');
  return q;
}

async function loadCluster(cid: string): Promise<QuestionCluster | undefined> {
  return toCluster(await kv().hgetall(keys.cluster(cid)));
}

/**
 * KEYS: voters, question, cluster. ARGV: anonId. Returns {added, votes}; added = -1 when
 * the question is hidden (checked inside the script, so a racing hide can't take a vote).
 */
const VOTE = `if redis.call('HGET', KEYS[2], 'status') == 'hidden' then return {-1, 0} end
if redis.call('SADD', KEYS[1], ARGV[1]) == 0 then
  return {0, tonumber(redis.call('HGET', KEYS[2], 'votes') or '0')} end
local v = redis.call('HINCRBY', KEYS[2], 'votes', 1)
if redis.call('EXISTS', KEYS[3]) == 1 then redis.call('HINCRBY', KEYS[3], 'votes', 1) end
return {1, v}`;

/** KEYS: question, cluster. ARGV: status. Returns {oldStatus, clusterDeltaApplied}. */
const SET_STATUS = `local old = redis.call('HGET', KEYS[1], 'status') or ''
redis.call('HSET', KEYS[1], 'status', ARGV[1])
local was, now = old == 'hidden', ARGV[1] == 'hidden'
if was ~= now and redis.call('EXISTS', KEYS[2]) == 1 then
  local sign = now and -1 or 1
  local votes = tonumber(redis.call('HGET', KEYS[1], 'votes') or '0')
  redis.call('HINCRBY', KEYS[2], 'size', sign)
  redis.call('HINCRBY', KEYS[2], 'votes', sign * votes)
  return {old, 1}
end
return {old, 0}`;

/**
 * A hidden question must not keep representing its cluster or naming it: hand both to the
 * most-voted open member, or blank the label if none is left.
 */
async function relabelWithout(c: QuestionCluster, hiddenId: string): Promise<QuestionCluster> {
  const r = kv();
  const labelFrom = await r.hget(keys.cluster(c.id), 'labelFrom');
  if (c.representativeQuestionId !== hiddenId && labelFrom !== hiddenId) return c;
  const best = (await readQuestions(r, c.sessionId))
    .filter((q) => q.clusterId === c.id && q.id !== hiddenId)
    .sort((a, b) => b.votes - a.votes)[0];
  const next = { ...c };
  const patch: Record<string, string> = {};
  if (c.representativeQuestionId === hiddenId)
    patch.representativeQuestionId = next.representativeQuestionId = best?.id ?? '';
  if (labelFrom === hiddenId) {
    patch.label = next.label = best ? provisionalLabel(best.text) : '';
    patch.labelFrom = best?.id ?? '';
  }
  await r.hset(keys.cluster(c.id), patch);
  return next;
}

export function registerQuestions(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>(
    '/sessions/:id/questions',
    { preHandler: requireRole('attendee') },
    async (req, reply): Promise<AskQuestionResponse> => {
      const claims = authOf(req);
      const { text } = parse(AskQuestionRequest, req.body ?? {});
      const s = await getLiveSession(req.params.id);
      assertSameEvent(claims, s);
      const r = kv();
      const qid = newId('q');

      const [mod, intent, dup] = await Promise.all([
        moderate(text),
        decide('question_intent', {
          state: { question: text, context: 'Audience question during a conference talk' },
          question:
            'What kind of question is this? clarification = asks to re-explain something; deep_dive = goes further into the topic; off_topic = unrelated to the talk.',
          labels: INTENTS,
          defaultLabel: 'deep_dive',
        }),
        findQuestionCluster({ eventId: s.eventId, sessionId: s.id, questionId: qid, text }).catch(
          (err: unknown) => {
            // Degrade to "new cluster"; log the error code only, never the text.
            logger.warn({ code: (err as { code?: string }).code }, 'question dedup failed');
            return { clusterId: null, score: 0 };
          },
        ),
      ]);
      const status = mod.label === 'hide' ? 'hidden' : 'open';

      // Join the matched cluster if it's live; otherwise open a new one. Hidden questions
      // never join or open a cluster.
      let cluster =
        status === 'open' && dup.clusterId ? await loadCluster(dup.clusterId) : undefined;
      const merged = cluster !== undefined;
      const q: Question = {
        id: qid,
        sessionId: s.id,
        eventId: s.eventId,
        anonId: claims.sub,
        text,
        clusterId: cluster?.id ?? newId('c'),
        votes: 0,
        status,
        at: new Date().toISOString(),
      };
      if (cluster) {
        cluster.size = await r.hincrby(keys.cluster(cluster.id), 'size', 1);
      } else {
        cluster = {
          id: q.clusterId,
          sessionId: s.id,
          label: provisionalLabel(text),
          size: status === 'open' ? 1 : 0,
          votes: 0,
          representativeQuestionId: qid,
        };
        if (status === 'open') {
          await r
            .multi()
            .hset(keys.cluster(cluster.id), { ...cluster, labelFrom: qid })
            .sadd(keys.clusters(s.id), cluster.id)
            .exec();
        }
      }

      await r
        .multi()
        .hset(keys.question(qid), { ...q, eventId: s.eventId, intent: intent.label })
        .lpush(keys.questions(s.id), qid)
        .incr(keys.questionCount(s.id))
        .exec();
      recordQuestion(qid);

      questionsCounter.add(1, { event: s.eventId, session: s.id });
      if (status === 'open') {
        dedupCounter.add(1, { event: s.eventId, merged: String(merged) });
        await Promise.all([publishQuestion('question.created', q), publishCluster(cluster)]);
      }
      reply.code(201);
      return { question: q, cluster, merged };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/questions/:id/vote',
    { preHandler: requireRole('attendee') },
    async (req) => {
      const claims = authOf(req);
      const q = await loadQuestion(req.params.id);
      if (q.eventId && q.eventId !== claims.eventId)
        throw new HttpError(403, 'forbidden', 'Token is for another event');
      if (q.status === 'hidden') throw new HttpError(404, 'question_not_found', 'No such question');
      const r = kv();
      // One vote per attendee per question; a repeat vote is a no-op. Atomic, so a
      // recorded voter always has a counted vote.
      const [added, votes] = (await r.eval(
        VOTE,
        3,
        keys.voters(q.id),
        keys.question(q.id),
        keys.cluster(q.clusterId),
        claims.sub,
      )) as [number, number];
      q.votes = Number(votes);
      if (added === -1) throw new HttpError(404, 'question_not_found', 'No such question');
      if (added === 0) return { questionId: q.id, votes: q.votes };
      const cluster = await loadCluster(q.clusterId);
      // The most-voted question represents its cluster.
      if (cluster && cluster.representativeQuestionId !== q.id) {
        const repVotes = Number(
          (await r.hget(keys.question(cluster.representativeQuestionId), 'votes')) ?? 0,
        );
        if (q.votes > repVotes) {
          cluster.representativeQuestionId = q.id;
          await r.hset(keys.cluster(cluster.id), 'representativeQuestionId', q.id);
        }
      }
      recordQuestion(q.id);
      await Promise.all([
        publishQuestion('question.updated', q),
        cluster ? publishCluster(cluster) : undefined,
      ]);
      return { questionId: q.id, votes: q.votes };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/questions/:id',
    { preHandler: requireRole('speaker') },
    async (req) => {
      const claims = authOf(req);
      const { status } = parse(PatchQuestionRequest, req.body ?? {});
      const q = await loadQuestion(req.params.id);
      if (q.eventId && q.eventId !== claims.eventId)
        throw new HttpError(403, 'forbidden', 'Token is for another event');
      const r = kv();
      // Status change and cluster deltas in one script: concurrent PATCHes apply a
      // visibility transition once. Hiding takes the question (and its votes) out of its
      // cluster; unhiding puts them back.
      const [old, applied] = (await r.eval(
        SET_STATUS,
        2,
        keys.question(q.id),
        keys.cluster(q.clusterId),
        status,
      )) as [string, number];
      const wasHidden = old === 'hidden';
      q.status = status;
      let cluster = await loadCluster(q.clusterId);
      if (cluster && applied && status === 'hidden') {
        cluster = await relabelWithout(cluster, q.id);
      } else if (cluster && applied && (!cluster.label || !cluster.representativeQuestionId)) {
        // Unhidden into a cluster that lost its label or representative: it takes both.
        const patch: Record<string, string> = {};
        if (!cluster.label) {
          patch.label = cluster.label = provisionalLabel(q.text);
          patch.labelFrom = q.id;
        }
        if (!cluster.representativeQuestionId)
          patch.representativeQuestionId = cluster.representativeQuestionId = q.id;
        await r.hset(keys.cluster(cluster.id), patch);
      } else if (!cluster && wasHidden && status !== 'hidden') {
        // Hidden at ask time, so it never opened a cluster: open one now.
        cluster = {
          id: q.clusterId,
          sessionId: q.sessionId,
          label: provisionalLabel(q.text),
          size: 1,
          votes: q.votes,
          representativeQuestionId: q.id,
        };
        await r
          .multi()
          .hset(keys.cluster(cluster.id), { ...cluster, labelFrom: q.id })
          .sadd(keys.clusters(q.sessionId), cluster.id)
          .exec();
      }
      recordQuestion(q.id);
      await Promise.all([
        publishQuestion('question.updated', q),
        cluster ? publishCluster(cluster) : undefined,
      ]);
      return { question: q };
    },
  );
}
