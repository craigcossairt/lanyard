import { AskQuestionResponse, channels, RerouteAcceptResponse, TranscriptResponse } from '@lanyard/contracts';
import type { FastifyInstance } from 'fastify';
import { demoActions, type DemoAction } from '../../../../worker/src/jobs/sim/demo';
import { actorId, type Crowd } from '../../../../worker/src/jobs/sim/scenario';
import type { Subscription } from '../../core/bus';
import type { ModuleContext } from '../../core/context';
import { signToken } from '../../core/tokens';

export interface SyntheticRecords {
  eventId: string; sessionIds: string[]; questionIds: string[]; chunkIds: string[]; anonIds: string[];
}
export type CleanupSynthetic = (records: SyntheticRecords) => Promise<unknown>;
const EVENT = 'cnh-demos';
const PLAN = demoActions();
const key = (run: Crowd, suffix: string) => `ops:cnh-demos:simulation:${run.id}:${suffix}`;

/** Separate bounded lanes keep moderation from delaying captions. Persisted
 * dispatch markers prevent duplicate question/caption writes after failover. */
export function createDemoRunner(app: FastifyInstance, ctx: ModuleContext, cleanup: CleanupSynthetic,
  ownsLease: () => Promise<boolean>, now = Date.now) {
  const work = new Map<string, Promise<void>>();
  let subscriptions: Subscription[] = [];
  let subscribedRun: string | undefined;
  let active = false;
  const kv = () => {
    if (!ctx.kv) throw new Error('Simulation storage unavailable');
    return ctx.kv;
  };
  async function request(run: Crowd, actor: number, path: string, payload: object, speaker = false) {
    if (!active || now() >= Date.parse(run.endsAt) || !await ownsLease() ||
      await kv().exists(`ops:cnh-demos:simulation:stop:${run.id}`)) throw new Error('Demo stopped');
    const token = signToken(ctx.config.tokenSigningKey!, {
      sub: actorId(run, actor), role: speaker ? 'speaker' : 'attendee', eventId: EVENT,
      handle: speaker ? 'SIMULATED speaker' : 'SIMULATED attendee',
    }, 600).token;
    const response = await app.inject({ method: 'POST', url: `/api${path}`,
      headers: { authorization: `Bearer ${token}` }, payload, signal: AbortSignal.timeout(7500) });
    if (response.statusCode >= 400) throw new Error('Demo action failed');
    return response.json();
  }
  function launch(id: string, task: () => Promise<void>) {
    work.set(id, task().catch(() => {
      ctx.logger.warn({ event: EVENT }, 'SIMULATED demo action failed');
    }).finally(() => { work.delete(id); }));
  }
  async function perform(run: Crowd, action: DemoAction) {
    const path = `/sessions/${encodeURIComponent(run.sessions[0])}`;
    if (action.kind === 'join') {
      await request(run, action.actor, `/sessions/${encodeURIComponent(run.sessions[action.stage])}/presence`, { kind: 'join' });
    } else if (action.kind === 'signal') {
      await request(run, action.actor, `${path}/signals`, { type: 'louder' });
    } else if (action.kind === 'caption') {
      const endedAt = new Date(now()).toISOString();
      const result = TranscriptResponse.parse(await request(run, action.actor, `${path}/transcript`, {
        text: action.text, source: 'typed', startedAt: new Date(now() - 4000).toISOString(), endedAt,
      }, true));
      await kv().sadd(key(run, 'chunks'), result.chunkId);
    } else {
      const result = AskQuestionResponse.parse(await request(run, action.actor, `${path}/questions`, { text: action.text }));
      await kv().sadd(key(run, 'questions'), result.question.id);
      // Vote through the normal deduplicated cluster's representative question.
      const questionId = result.cluster.representativeQuestionId ?? result.question.id;
      if (active && now() < Date.parse(run.endsAt)) await Promise.all([1, 2].map(offset =>
        request(run, (action.actor + offset) % run.attendees, `/questions/${encodeURIComponent(questionId)}/vote`, {})));
    }
  }
  function detach() {
    active = false;
    for (const off of subscriptions) off();
    subscriptions = []; subscribedRun = undefined;
  }
  async function subscribe(run: Crowd) {
    if (subscribedRun === run.id) return;
    detach(); active = true; subscribedRun = run.id;
    subscriptions = Array.from({ length: run.attendees }, (_, actor) => ctx.bus.subscribe(channels.user(actorId(run, actor)), message => {
      if (!active || message.type !== 'reroute.suggested' || now() >= Date.parse(run.endsAt)) return;
      // Suggestions originate only from the organizer's normal Reroute action.
      if (!run.sessions.includes(message.payload.sessionId) || !message.payload.suggestionId ||
        message.payload.anonId !== actorId(run, actor)) return;
      const id = `offer-${actor}`;
      if (!work.has(id)) launch(id, async () => {
        await kv().hset(key(run, 'offers'), String(actor), JSON.stringify(message.payload));
      });
    }));
    // Bus retries independently; do not block captions on a reconnect.
  }
  return {
    async step(run: Crowd) {
      active = true;
      await subscribe(run);
      const elapsed = now() - Date.parse(run.startedAt);
      const dispatched = new Set(await kv().smembers(key(run, 'dispatched')));
      for (const action of PLAN) {
        if (action.at > elapsed || dispatched.has(action.id) || work.has(action.id)) continue;
        const lane = action.kind === 'question' ? 'question-' : action.kind === 'caption' ? 'caption-' : undefined;
        if (lane && [...work.keys()].filter(id => id.startsWith(lane)).length >= (lane === 'question-' ? 2 : 1)) continue;
        if (!lane && work.size >= 8) continue;
        // A fixed script, with no unbounded queue or catch-up loop.
        if (await kv().sadd(key(run, 'dispatched'), action.id)) launch(action.id, () => perform(run, action));
      }
      const offers = await kv().hgetall(key(run, 'offers'));
      for (const [actor, raw] of Object.entries(offers)) {
        const id = `accept-${actor}`;
        if (work.has(id) || work.size >= 8) continue;
        launch(id, async () => {
          const offer = JSON.parse(raw) as { suggestionId: string };
          const result = RerouteAcceptResponse.parse(await request(run, Number(actor), `/events/${EVENT}/reroute/accept`, { suggestionId: offer.suggestionId }));
          if (!run.sessions.includes(result.sessionId)) throw new Error('Unexpected demo destination');
          await request(run, Number(actor), `/sessions/${encodeURIComponent(result.sessionId)}/presence`, { kind: 'join' });
          await kv().hdel(key(run, 'offers'), actor);
        });
      }
    },
    async cleanup(run: Crowd) {
      detach();
      await Promise.allSettled(work.values());
      const [questionIds, chunkIds] = await Promise.all([
        kv().smembers(key(run, 'questions')), kv().smembers(key(run, 'chunks')),
      ]);
      await cleanup({ eventId: EVENT, sessionIds: run.sessions, questionIds, chunkIds,
        anonIds: Array.from({ length: run.attendees }, (_, actor) => actorId(run, actor)) });
      await kv().del(...['questions', 'chunks', 'dispatched', 'offers'].map(suffix => key(run, suffix)));
    },
    detach,
    async close() { detach(); await Promise.allSettled(work.values()); },
  };
}
