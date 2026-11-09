// POST /api/sessions/:id/transcript (speaker): append one finalized caption chunk.
// Writes cnh-transcripts (record), pushes the Valkey caption tail (snapshot), publishes
// caption.appended, and records conf.caption.lag_ms from the client's utterance end.
import type { FastifyInstance } from 'fastify';
import { metrics } from '@opentelemetry/api';
import { channels, ES_INDICES, METRICS, realtime, TranscriptRequest } from '@lanyard/contracts';
import { authOf, requireRole } from '../../core/auth';
import { getBus } from '../../core/context';
import { parse } from '../../core/errors';
import { es } from '../../core/es';
import { assertSameEvent, CAPTION_TAIL, getLiveSession, keys, kv } from './store';

const captionLag = metrics
  .getMeter('lanyard')
  .createHistogram(METRICS.captionLagMs, { unit: 'ms' });

/** Lag above this is a client clock problem, not a pipeline one: don't record it. */
const MAX_PLAUSIBLE_LAG_MS = 60_000;

export function registerTranscript(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>(
    '/sessions/:id/transcript',
    { preHandler: requireRole('speaker') },
    async (req, reply) => {
      const body = parse(TranscriptRequest, req.body ?? {});
      const s = await getLiveSession(req.params.id);
      assertSameEvent(authOf(req), s);
      const r = kv();

      const seq = body.seq ?? (await r.incr(keys.seq(s.id)));
      if (body.seq !== undefined) {
        // Keep the server counter ahead of client-chosen seqs.
        const cur = Number((await r.get(keys.seq(s.id))) ?? 0);
        if (body.seq > cur) await r.set(keys.seq(s.id), body.seq);
      }
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
      // Stable id: a retried chunk overwrites itself instead of duplicating.
      const record = es(ES_INDICES.transcripts, 'index', (c, o) =>
        c.index({ index: ES_INDICES.transcripts, id: chunk.id, document: chunk }, o),
      );
      await Promise.all([fanout, tail, record]);
      reply.code(201);
      return { chunkId: chunk.id, seq };
    },
  );
}
