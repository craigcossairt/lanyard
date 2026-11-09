// POST /api/sessions/:id/catch-up (attendee): "catch me up on the last N minutes".
// The summary comes from the worker job `catchup` (fast model) and is cached in Valkey per
// session, window and minute. Concurrent misses share one generation: in-process
// single-flight, plus a Valkey lock across replicas (the losers poll the cache). The whole
// request, lookups included, stays inside the 8 s budget.
import type { FastifyInstance } from 'fastify';
import { CatchUpRequest, type CatchUpResponse } from '@lanyard/contracts';
import { authOf, requireRole } from '../../core/auth';
import { HttpError, parse } from '../../core/errors';
import { runJob } from '../../core/jobs';
import { logger } from '../../core/logger';
import { assertSameEvent, getLiveSession, keys, kv } from './store';

const BUDGET_MS = 8_000;
const CACHE_TTL_S = 120;
const POLL_MS = 250;

const inflight = new Map<string, Promise<CatchUpResponse>>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generate(
  key: string,
  sessionId: string,
  minutes: number,
  deadline: number,
): Promise<CatchUpResponse> {
  const r = kv();
  const lock = `${key}:lock`;
  if (await r.set(lock, '1', 'PX', BUDGET_MS, 'NX')) {
    try {
      const result = (await runJob<CatchUpResponse>(
        'catchup',
        { sessionId, minutes },
        { timeoutMs: Math.max(500, deadline - Date.now()) },
      )) ?? { summary: '', fromSeq: 0, toSeq: 0 };
      // Empty summaries (no captions yet) aren't cached, so the first caption shows up.
      if (result.summary)
        await r
          .set(key, JSON.stringify(result), 'EX', CACHE_TTL_S)
          .catch(() => logger.warn('catch-up cache write failed'));
      return result;
    } finally {
      await r.del(lock).catch(() => undefined);
    }
  }
  // Another replica is generating: wait for its result within our budget.
  while (Date.now() + POLL_MS < deadline) {
    await sleep(POLL_MS);
    const hit = await r.get(key);
    if (hit) return JSON.parse(hit) as CatchUpResponse;
    if (!(await r.exists(lock))) break; // it finished without caching (empty or failed)
  }
  throw new HttpError(503, 'catchup_busy', 'Catch-up is being prepared; retry shortly');
}

export function registerCatchUp(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>(
    '/sessions/:id/catch-up',
    { preHandler: requireRole('attendee') },
    async (req): Promise<CatchUpResponse> => {
      const deadline = Date.now() + BUDGET_MS;
      const claims = authOf(req);
      const { minutes } = parse(CatchUpRequest, req.body ?? {});
      const s = await getLiveSession(req.params.id);
      assertSameEvent(claims, s);
      const key = keys.catchUp(s.id, minutes, Math.floor(Date.now() / 60_000));

      const hit = await kv().get(key);
      if (hit) return JSON.parse(hit) as CatchUpResponse;

      let p = inflight.get(key);
      if (!p) {
        p = generate(key, s.id, minutes, deadline).finally(() => inflight.delete(key));
        inflight.set(key, p);
      }
      return p;
    },
  );
}
