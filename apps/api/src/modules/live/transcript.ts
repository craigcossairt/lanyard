// POST /api/sessions/:id/transcript (speaker): append one finalized caption chunk.
// Pushes the Valkey caption tail (snapshot), publishes
// caption.appended, records conf.caption.lag_ms from the client's utterance end, then writes
// the cnh-transcripts record in the background.
import type { FastifyInstance } from 'fastify';
import { metrics } from '@opentelemetry/api';
import {
  channels,
  ES_INDICES,
  EVENT_IDS,
  METRICS,
  realtime,
  TranscriptRequest,
} from '@lanyard/contracts';
import { authOf, requireRole } from '../../core/auth';
import { getBus } from '../../core/context';
import { parse } from '../../core/errors';
import { es } from '../../core/es';
import { logger } from '../../core/logger';
import { assertSameEvent, CAPTION_TAIL, getLiveSession, keys, kv } from './store';

const captionLag = metrics
  .getMeter('lanyard')
  .createHistogram(METRICS.captionLagMs, { unit: 'ms' });

const SEQ_MAX = `local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if tonumber(ARGV[1]) > c then redis.call('SET', KEYS[1], ARGV[1]) end
return 1`;

/** Demo-engine caption ledger lifetime (WS4's sim runs are well under this). */
const SYNTHETIC_LEDGER_TTL_S = 2 * 3600;

/** Lag above this is a client clock problem, not a pipeline one: don't record it. */
const MAX_PLAUSIBLE_LAG_MS = 60_000;

// Pending background records (including a scheduled retry), drained on shutdown.
const pending = new Set<Promise<void>>();
const DRAIN_MS = 3_000;

async function writeChunk(chunk: { id: string }): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await es(ES_INDICES.transcripts, 'index', (c, o) =>
        c.index({ index: ES_INDICES.transcripts, id: chunk.id, document: chunk }, o),
      );
      return;
    } catch (err) {
      if (attempt >= 2) {
        // Identifiers and the wrapper's sanitized error only: never the caption text.
        logger.warn(
          { chunkId: chunk.id, code: (err as { code?: string }).code },
          'transcript record failed',
        );
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

function recordChunk(chunk: { id: string }): void {
  const p = writeChunk(chunk).finally(() => pending.delete(p));
  pending.add(p);
}

export function registerTranscript(app: FastifyInstance): void {
  // Graceful shutdown (rollouts): let acknowledged captions finish their ES record.
  app.addHook('onClose', async () => {
    if (pending.size === 0) return;
    await Promise.race([
      Promise.allSettled([...pending]),
      new Promise((r) => setTimeout(r, DRAIN_MS).unref()),
    ]);
  });
  app.post<{ Params: { id: string } }>(
    '/sessions/:id/transcript',
    { preHandler: requireRole('speaker') },
    async (req, reply) => {
      const body = parse(TranscriptRequest, req.body ?? {});
      const s = await getLiveSession(req.params.id);
      const claims = authOf(req);
      assertSameEvent(claims, s);
      const r = kv();

      // Client-chosen seqs push the server counter forward atomically (it never decreases).
      const seq =
        body.seq === undefined
          ? await r.incr(keys.seq(s.id))
          : (await r.eval(SEQ_MAX, 1, keys.seq(s.id), body.seq), body.seq);
      const now = new Date().toISOString();
      const endedAt = body.endedAt ?? now;
      const chunk = {
        id: `${s.id}:${seq}`,
        sessionId: s.id,
        eventId: s.eventId,
        seq,
        text: body.text,
        startedAt: body.startedAt ?? endedAt,
        endedAt,
        lang: body.lang,
        source: body.source,
      };
      const caption = { chunkId: chunk.id, seq, text: chunk.text, lang: chunk.lang, endedAt };

      // Fan out first (that's what the lag SLO measures), record in parallel.
      // Demo engine ledger: a simulated speaker's chunks are recorded before they go out,
      // so cleanupSynthetic can find them even if the simulator crashes mid-run.
      if (s.eventId === EVENT_IDS.cnhDemos && claims.sub.startsWith('sim_'))
        await r
          .multi()
          .sadd(keys.syntheticChunks(claims.sub), chunk.id)
          .expire(keys.syntheticChunks(claims.sub), SYNTHETIC_LEDGER_TTL_S)
          .exec();
      const fanout = (async () => {
        await getBus().publish(
          channels.session(s.id),
          realtime('caption.appended', {
            chunkId: caption.chunkId,
            seq,
            text: caption.text,
            lang: caption.lang,
          }),
        );
        if (body.endedAt) {
          const lag = Date.now() - Date.parse(body.endedAt);
          if (lag >= 0 && lag < MAX_PLAUSIBLE_LAG_MS)
            captionLag.record(lag, { event: s.eventId, session: s.id });
        }
      })();
      const tail = r
        .multi()
        .lpush(keys.captions(s.id), JSON.stringify(caption))
        .ltrim(keys.captions(s.id), 0, CAPTION_TAIL - 1)
        .exec();
      await Promise.all([fanout, tail]);
      // The ES record (catch-up, "ask the conference") is off the hot path: indexing embeds
      // the text (semantic_text) and can take ~2 s, which must not fail a caption that is
      // already live. Stable id, so the one retry overwrites instead of duplicating.
      recordChunk(chunk);
      reply.code(201);
      return { chunkId: chunk.id, seq };
    },
  );
}
