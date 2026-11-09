// POST /api/sessions/:id/transcript (speaker): append one finalized caption chunk.
// Pushes the Valkey caption tail (snapshot), publishes
// caption.appended, records conf.caption.lag_ms from the client's utterance end, then writes
// the cnh-transcripts record in the background.
import type { FastifyInstance } from 'fastify';
import { metrics } from '@opentelemetry/api';
import { channels, ES_INDICES, METRICS, realtime, TranscriptRequest } from '@lanyard/contracts';
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

/** Lag above this is a client clock problem, not a pipeline one: don't record it. */
const MAX_PLAUSIBLE_LAG_MS = 60_000;

function recordChunk(chunk: { id: string }, attempt = 1): void {
  es(ES_INDICES.transcripts, 'index', (c, o) =>
    c.index({ index: ES_INDICES.transcripts, id: chunk.id, document: chunk }, o),
  ).catch(() => {
    if (attempt < 2) setTimeout(() => recordChunk(chunk, attempt + 1), 500).unref();
    else logger.warn('transcript record failed');
  });
}

export function registerTranscript(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>(
    '/sessions/:id/transcript',
    { preHandler: requireRole('speaker') },
    async (req, reply) => {
      const body = parse(TranscriptRequest, req.body ?? {});
      const s = await getLiveSession(req.params.id);
      assertSameEvent(authOf(req), s);
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
