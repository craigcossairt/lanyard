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
import { assertSameEvent, getLiveSession, keys, kv, toCluster, toQuestion } from './store';

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

/** ES record update off the hot path; Valkey already holds the live value. */
function recordUpdate(qid: string, doc: Partial<Question>) {
  es(ES_INDICES.questions, 'update', (c, o) =>
    c.update({ index: ES_INDICES.questions, id: qid, doc }, o),
  ).catch(() => logger.warn('question record update failed'));
}

async function loadQuestion(qid: string): Promise<Question> {
  const q = toQuestion(await kv().hgetall(keys.question(qid)));
  if (!q) throw new HttpError(404, 'question_not_found', 'No such question');
  return q;
}

async function loadCluster(cid: string): Promise<QuestionCluster | undefined> {
  return toCluster(await kv().hgetall(keys.cluster(cid)));
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
          () => ({ clusterId: null, score: 0 }),
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
            .hset(keys.cluster(cluster.id), cluster)
            .sadd(keys.clusters(s.id), cluster.id)
            .exec();
        }
      }

      await Promise.all([
        r
          .multi()
          .hset(keys.question(qid), { ...q, eventId: s.eventId, intent: intent.label })
          .lpush(keys.questions(s.id), qid)
          .incr(keys.questionCount(s.id))
          .exec(),
        es(ES_INDICES.questions, 'index', (c, o) =>
          c.index(
            { index: ES_INDICES.questions, id: qid, document: { ...q, intent: intent.label } },
            o,
          ),
        ),
      ]);

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
      // One vote per attendee per question; a repeat vote is a no-op.
      if ((await r.sadd(keys.voters(q.id), claims.sub)) === 0)
        return { questionId: q.id, votes: q.votes };

      const res = await r
        .multi()
        .hincrby(keys.question(q.id), 'votes', 1)
        .hincrby(keys.cluster(q.clusterId), 'votes', 1)
        .exec();
      q.votes = Number(res?.[0]?.[1] ?? q.votes + 1);
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
      recordUpdate(q.id, { votes: q.votes });
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
      const wasHidden = q.status === 'hidden';
      q.status = status;
      await r.hset(keys.question(q.id), 'status', status);

      // Hiding takes a question (and its votes) out of its cluster; unhiding puts it back.
      let cluster = await loadCluster(q.clusterId);
      if (cluster && wasHidden !== (status === 'hidden')) {
        const sign = status === 'hidden' ? -1 : 1;
        const res = await r
          .multi()
          .hincrby(keys.cluster(cluster.id), 'size', sign)
          .hincrby(keys.cluster(cluster.id), 'votes', sign * q.votes)
          .exec();
        cluster = { ...cluster, size: Number(res?.[0]?.[1]), votes: Number(res?.[1]?.[1]) };
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
          .hset(keys.cluster(cluster.id), cluster)
          .sadd(keys.clusters(q.sessionId), cluster.id)
          .exec();
      }
      recordUpdate(q.id, { status });
      await Promise.all([
        publishQuestion('question.updated', q),
        cluster ? publishCluster(cluster) : undefined,
      ]);
      return { question: q };
    },
  );
}
