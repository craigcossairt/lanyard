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

// One republish per session just after the newest signal ages out, so meters decay to
// zero without a ticker. Per pod; duplicates across pods carry the same counts.
const decay = new Map<string, NodeJS.Timeout>();
function scheduleDecay(s: LiveSession): void {
  clearTimeout(decay.get(s.id));
  const t = setTimeout(
    () => {
      decay.delete(s.id);
      publishWindow(s).catch(() => logger.warn('signals decay publish failed'));
    },
    SIGNAL_WINDOW_SEC * 1000 + 500,
  ).unref();
  decay.set(s.id, t);
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
      await r
        .multi()
        .zadd(key, now, `${claims.sub}:${now}`)
        .zremrangebyscore(key, '-inf', now - SIGNAL_TRIM_SEC * 1000)
        .expire(key, SIGNAL_TRIM_SEC * 2)
        .exec();
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

      await publishWindow(s);
      scheduleDecay(s);
      return { accepted: true };
    },
  );
}
