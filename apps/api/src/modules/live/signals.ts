// POST /api/sessions/:id/signals (attendee): slower / louder / cant_see / lost / thumbs_up /
// too_cold / too_hot. Rate-limited to 1 per type per 30 s per anonId. Each accepted signal
// goes into signals:{sid}:{type} (ZSET, score = epoch ms, trimmed past 120 s; the rolling
// 60 s count is ZCOUNT), the ES cnh-signals record and conf.signals, then signals.window
// is published on the session and ops channels.
import type { FastifyInstance } from 'fastify';
import { metrics } from '@opentelemetry/api';
import { channels, ES_INDICES, METRICS, realtime, SignalRequest } from '@lanyard/contracts';
import { authOf, requireRole } from '../../core/auth';
import { getBus } from '../../core/context';
import { parse } from '../../core/errors';
import { es } from '../../core/es';
import { logger } from '../../core/logger';
import {
  assertSameEvent,
  getLiveSession,
  keys,
  kv,
  readSignalWindow,
  SIGNAL_TRIM_SEC,
  SIGNAL_WINDOW_SEC,
  type LiveSession,
} from './store';

const RATE_SEC = 30;
const signalsCounter = metrics.getMeter('lanyard').createCounter(METRICS.signals);

async function publishWindow(s: LiveSession): Promise<void> {
  const counts = await readSignalWindow(kv(), s.id);
  const msg = realtime('signals.window', {
    sessionId: s.id,
    roomId: s.roomId,
    windowSec: SIGNAL_WINDOW_SEC,
    counts,
  });
  await Promise.all([
    getBus().publish(channels.session(s.id), msg),
    getBus().publish(channels.ops(s.eventId), msg),
  ]);
}

// Republish when each signal ages out of the window, so meters decay without a ticker.
// Timers are coalesced per session and second. Per pod; duplicates across pods carry the
// same counts.
const decay = new Set<string>();
function scheduleDecay(s: LiveSession, at: number): void {
  const due = Math.ceil((at + SIGNAL_WINDOW_SEC * 1000) / 1000) * 1000 + 250;
  const id = `${s.id}:${due}`;
  if (decay.has(id)) return;
  decay.add(id);
  setTimeout(
    () => {
      decay.delete(id);
      publishWindow(s).catch(() => logger.warn('signals decay publish failed'));
    },
    Math.max(0, due - Date.now()),
  ).unref();
}

export function registerSignals(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>(
    '/sessions/:id/signals',
    { preHandler: requireRole('attendee') },
    async (req) => {
      const claims = authOf(req);
      const { type } = parse(SignalRequest, req.body ?? {});
      const s = await getLiveSession(req.params.id);
      assertSameEvent(claims, s);
      const r = kv();

      const rateKey = keys.rate(s.id, claims.sub, type);
      if ((await r.set(rateKey, '1', 'EX', RATE_SEC, 'NX')) === null) {
        const ttl = await r.ttl(rateKey);
        return { accepted: false, retryAfterSec: ttl > 0 ? ttl : RATE_SEC };
      }

      const now = Date.now();
      const key = keys.signals(s.id, type);
      try {
        const res = await r
          .multi()
          .zadd(key, now, `${claims.sub}:${now}`)
          .zremrangebyscore(key, '-inf', now - SIGNAL_TRIM_SEC * 1000)
          .expire(key, SIGNAL_TRIM_SEC * 2)
          .exec();
        if (!res || res.some(([err]) => err)) throw new Error('signal write failed');
      } catch (err) {
        // Not stored: give the rate slot back so the attendee's retry counts.
        await r.del(rateKey).catch(() => undefined);
        throw err;
      }
      signalsCounter.add(1, { event: s.eventId, room: s.roomId, type });

      const doc = {
        sessionId: s.id,
        roomId: s.roomId,
        eventId: s.eventId,
        anonId: claims.sub,
        type,
        at: new Date(now).toISOString(),
      };
      es(ES_INDICES.signals, 'index', (c, o) =>
        c.index({ index: ES_INDICES.signals, document: doc }, o),
      ).catch(() => logger.warn({ type }, 'signal record failed'));

      // Stored is accepted: a fan-out hiccup must not turn it into an error.
      publishWindow(s).catch(() => logger.warn('signals publish failed'));
      scheduleDecay(s, now);
      return { accepted: true };
    },
  );
}
