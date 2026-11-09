// POST /api/sessions/:id/catch-up (attendee): "catch me up on the last N minutes".
// The summary comes from the worker job `catchup` (fast model, 8 s budget) and is cached
// in Valkey per session, window and minute, so a room full of requests costs one LLM call
// per minute. The route never blocks longer than the 8 s budget.
import type { FastifyInstance } from 'fastify';
import { CatchUpRequest, type CatchUpResponse } from '@lanyard/contracts';
import { authOf, requireRole } from '../../core/auth';
import { parse } from '../../core/errors';
import { runJob } from '../../core/jobs';
import { logger } from '../../core/logger';
import { assertSameEvent, getLiveSession, keys, kv } from './store';

const BUDGET_MS = 8_000;
const CACHE_TTL_S = 120;

export function registerCatchUp(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>(
    '/sessions/:id/catch-up',
    { preHandler: requireRole('attendee') },
    async (req): Promise<CatchUpResponse> => {
      const claims = authOf(req);
      const { minutes } = parse(CatchUpRequest, req.body ?? {});
      const s = await getLiveSession(req.params.id);
      assertSameEvent(claims, s);
      const r = kv();
      const key = keys.catchUp(s.id, minutes, Math.floor(Date.now() / 60_000));

      const hit = await r.get(key);
      if (hit) return JSON.parse(hit) as CatchUpResponse;

      const result = (await runJob<CatchUpResponse>(
        'catchup',
        { sessionId: s.id, minutes },
        { timeoutMs: BUDGET_MS },
      )) ?? { summary: '', fromSeq: 0, toSeq: 0 };
      // Empty summaries (no captions yet) aren't cached, so the first caption shows up.
      if (result.summary)
        r.set(key, JSON.stringify(result), 'EX', CACHE_TTL_S).catch(() =>
          logger.warn('catch-up cache write failed'),
        );
      return result;
    },
  );
}
