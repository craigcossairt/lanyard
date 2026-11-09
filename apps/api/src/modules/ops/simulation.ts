import { randomUUID } from 'node:crypto';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actorId, ambientAction, createCrowd, nextBatch, type Action } from '../../../../worker/src/jobs/sim/scenario';
import { DEMO_DURATION_MS } from '../../../../worker/src/jobs/sim/demo';
import type { ModuleContext } from '../../core/context';
import { getNowNext, getRooms } from '../../core/events';
import { HttpError } from '../../core/errors';
import { signToken } from '../../core/tokens';
import { cleanupSynthetic } from '../live/cleanup';
import { createDemoRunner } from './demo-runner';

const EVENT = 'cnh-demos';
const STATE = 'ops:cnh-demos:simulation';
const LEASE = `${STATE}:lease`;
const State = z.object({
  id: z.string().uuid(), sessions: z.tuple([z.string().min(1), z.string().min(1)]),
  attendees: z.number().int().min(1).max(200), startedAt: z.iso.datetime(), endsAt: z.iso.datetime(),
  stopping: z.boolean(), cursor: z.number().int().min(0).max(400), step: z.number().int().min(-1),
  mode: z.enum(['crowd', 'demo']).default('crowd'),
}).refine(s => Date.parse(s.endsAt) - Date.parse(s.startedAt) <= 600_000);
type State = z.infer<typeof State>;
const TAKE = `if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('PEXPIRE', KEYS[1], 20000) return 1 end
return redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', 20000) and 1 or 0`;
const SAVE = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
if ARGV[2] == '' then redis.call('DEL', KEYS[2]) else redis.call('SET', KEYS[2], ARGV[2]) end
return 1`;

/** Elected runner uses in-process HTTP injection: the same auth, validation,
 * presence, signal and question handlers as real attendees, with no network hop.
 * Only run metadata is written here; WS2 owns every live-state mutation. */
export function createSimulation(app: FastifyInstance, ctx: ModuleContext,
  deps = { rooms: getRooms, schedule: getNowNext, now: Date.now }) {
  const owner = randomUUID();
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | undefined;
  let closed = false;
  const tracer = trace.getTracer('lanyard.ops.sim');
  const kv = () => {
    if (!ctx.kv || !ctx.config.tokenSigningKey) throw new HttpError(503, 'simulation_unavailable', 'Simulation is unavailable');
    return ctx.kv;
  };
  const read = async () => {
    const raw = await kv().get(STATE);
    try { return raw ? State.parse(JSON.parse(raw)) : undefined; }
    catch { throw new HttpError(503, 'simulation_unavailable', 'Simulation state is unavailable'); }
  };
  const stopKey = (s: State) => `${STATE}:stop:${s.id}`;
  const save = (s: State, done = false) => kv().eval(SAVE, 2, LEASE, STATE, owner, done ? '' : JSON.stringify(s));
  const demo = createDemoRunner(app, ctx, records => cleanupSynthetic(ctx, records),
    async () => await kv().get(LEASE) === owner, deps.now);
  async function act(s: State, action: Action) {
    if (action.kind !== 'leave' && deps.now() >= Date.parse(s.endsAt)) return;
    const token = signToken(ctx.config.tokenSigningKey!, {
      sub: actorId(s, action.actor), role: 'attendee', eventId: EVENT, handle: 'SIMULATED attendee',
    }, 3600).token;
    const suffix = action.kind === 'signal' ? 'signals' : action.kind === 'question' ? 'questions' : 'presence';
    const payload = action.kind === 'signal' ? { type: 'lost' }
      : action.kind === 'question' ? { text: 'SIMULATED: How can we observe conference room capacity?' }
      : { kind: action.kind };
    const response = await app.inject({
      method: 'POST', url: `/api/sessions/${encodeURIComponent(action.sessionId)}/${suffix}`,
      headers: { authorization: `Bearer ${token}` }, payload, signal: AbortSignal.timeout(7500),
    });
    if (response.statusCode >= 400) throw new Error('Simulated attendee action failed');
  }
  async function tick() {
    await tracer.startActiveSpan('ops.simulation.tick', { attributes: { event: EVENT } }, async span => {
      try {
        if (closed || !ctx.kv || !ctx.config.tokenSigningKey) return;
        if (Number(await kv().eval(TAKE, 1, LEASE, owner)) !== 1) { demo.detach(); return; }
        const state = await read();
        if (!state) { demo.detach(); return; }
        if (!state.stopping && (deps.now() >= Date.parse(state.endsAt) || await kv().exists(stopKey(state)))) {
          state.stopping = true;
          state.cursor = 0;
          await save(state); // Persist cleanup intent before any leave; survives process restart.
        }
        if (state.mode === 'demo' && !state.stopping) { await demo.step(state); return; }
        if (state.stopping) demo.detach();
        const batch = nextBatch(state, deps.now());
        if (!batch.done) {
          const results = await Promise.allSettled(batch.actions.map(a => act(state, a)));
          if (results.some(r => r.status === 'rejected')) throw new Error('Simulated batch failed');
          state.cursor += batch.actions.length;
          await save(state);
        } else if (state.stopping) {
          if (state.mode === 'demo') await demo.cleanup(state);
          await save(state, true);
          await kv().del(stopKey(state));
        } else {
          const step = Math.floor((deps.now() - Date.parse(state.startedAt)) / 5000);
          if (step > state.step) {
            // Persist before non-idempotent questions, avoiding repeat writes after restart.
            state.step = step;
            if (Number(await save(state)) === 1) await act(state, ambientAction(state, step));
          }
        }
      } catch {
        const error = new Error('Simulation tick failed');
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        ctx.logger.warn({ event: EVENT }, error.message);
      } finally { span.end(); }
    });
  }
  async function status(eventId: string) {
    if (eventId !== EVENT) throw new HttpError(400, 'simulation_event', 'Simulation is available only for CNH Demos');
    const state = await read();
    const stopping = state ? state.stopping || deps.now() >= Date.parse(state.endsAt) || Boolean(await kv().exists(stopKey(state))) : false;
    return { simulated: true as const, running: Boolean(state) && !stopping, stopping,
      mode: state?.mode, attendees: state?.attendees ?? 0, startedAt: state?.startedAt, endsAt: state?.endsAt };
  }
  return {
    status, tick,
    async control(eventId: string, running: boolean, attendees = 40, mode: 'crowd' | 'demo' = 'crowd') {
      await status(eventId);
      if (!running) {
        const state = await read();
        if (state) await kv().set(stopKey(state), '1', 'EX', 86400);
      } else {
        if (!app.hasRoute({ method: 'POST', url: '/api/sessions/:id/presence' }) ||
          !app.hasRoute({ method: 'POST', url: '/api/sessions/:id/signals' }) ||
          !app.hasRoute({ method: 'POST', url: '/api/sessions/:id/questions' }) ||
          (mode === 'demo' && (!app.hasRoute({ method: 'POST', url: '/api/sessions/:id/transcript' }) ||
            !app.hasRoute({ method: 'POST', url: '/api/questions/:id/vote' }) ||
            !app.hasRoute({ method: 'POST', url: '/api/events/:eventId/reroute/accept' })))) {
          throw new HttpError(503, 'simulation_unavailable', 'Attendee routes are not ready');
        }
        const [rooms, schedule] = await Promise.all([deps.rooms(EVENT), deps.schedule(EVENT)]);
        const sessions = ['Main Stage', 'Side Stage'].map(name => {
          const room = rooms.find(r => r.name === name);
          return schedule.now.find(s => s.roomId === room?.id && s.status !== 'ended');
        });
        if (!sessions[0] || !sessions[1]) throw new HttpError(409, 'simulation_sessions', 'Start concurrent Main Stage and Side Stage sessions first');
        const state: State = { ...createCrowd(randomUUID(), [sessions[0].id, sessions[1].id],
          mode === 'demo' ? 40 : attendees, deps.now()), step: -1, mode };
        if (mode === 'demo') state.endsAt = new Date(deps.now() + DEMO_DURATION_MS).toISOString();
        if (!await kv().set(STATE, JSON.stringify(state), 'NX')) {
          throw new HttpError(409, 'simulation_active', 'A simulation is already running or cleaning up');
        }
      }
      return status(eventId);
    },
    start() {
      timer = setInterval(() => {
        if (!pending && !closed) pending = tick().finally(() => { pending = undefined; });
      }, 1000);
      timer.unref();
    },
    async close() { closed = true; clearInterval(timer); await pending; await demo.close(); },
  };
}
