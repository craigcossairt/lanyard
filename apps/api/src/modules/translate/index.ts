// WS11: on-demand translated captions (Spanish). Reads WS2's caption tail, warms Valkey
// cache via the worker `translate` job, returns whatever is cached within 7.5 s.
import type { FastifyInstance } from 'fastify';
import {
  TranslatedCaptionsQuery,
  type TranslatedCaptionLine,
  type TranslatedCaptionsResponse,
} from '@lanyard/contracts';
import { authOf, requireRole } from '../../core/auth';
import { parse } from '../../core/errors';
import { defineModule } from '../../core/module';
import { runJob } from '../../core/jobs';
import { assertSameEvent, getLiveSession, kv, readCaptions } from '../live/store';

const BUDGET_MS = 7_500;
const trKey = (chunkId: string, lang: string) => `tr:${chunkId}:${lang}`;

export default defineModule({
  name: 'translate',
  register(app: FastifyInstance): void {
    app.get<{ Params: { id: string }; Querystring: Record<string, string | undefined> }>(
      '/sessions/:id/captions/translated',
      { preHandler: requireRole('attendee') },
      async (req): Promise<TranslatedCaptionsResponse> => {
        const deadline = Date.now() + BUDGET_MS;
        const { lang, since } = parse(TranslatedCaptionsQuery, req.query ?? {});
        const s = await getLiveSession(req.params.id);
        assertSameEvent(authOf(req), s);
        const r = kv();
        const source = (await readCaptions(r, s.id)).filter((c) => c.seq > since);
        if (source.length === 0) return [];

        const keys = source.map((c) => trKey(c.chunkId, lang));
        const cachedRaw = await r.mget(...keys);
        const out: TranslatedCaptionLine[] = [];
        const missing: typeof source = [];
        source.forEach((c, i) => {
          const text = cachedRaw[i];
          if (text) out.push({ chunkId: c.chunkId, seq: c.seq, lang, text });
          else missing.push(c);
        });

        if (missing.length > 0 && Date.now() < deadline) {
          try {
            await runJob(
              'translate',
              {
                eventId: s.eventId,
                lang,
                chunks: missing.map((c) => ({ chunkId: c.chunkId, seq: c.seq, text: c.text })),
              },
              { timeoutMs: Math.max(500, deadline - Date.now()) },
            );
          } catch {
            // Partial cache hits are fine; the client retries on the next caption.
          }
          const refill = await r.mget(...missing.map((c) => trKey(c.chunkId, lang)));
          missing.forEach((c, i) => {
            const text = refill[i];
            if (text) out.push({ chunkId: c.chunkId, seq: c.seq, lang, text });
          });
        }

        out.sort((a, b) => a.seq - b.seq);
        return out;
      },
    );
  },
});
