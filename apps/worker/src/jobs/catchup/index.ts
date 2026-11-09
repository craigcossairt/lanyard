// Catch-up summary (WS2): the last N minutes of one session's captions, summarized by the
// fast model inside the 8 s catch-up budget. Only a bounded tail of the transcript is sent
// (never the whole talk). The API caches the result per session, window and minute.
import { defineJob } from '../../../../api/src/core/jobs';
import { llm } from '../../../../api/src/core/llm';
import { lastTranscriptChunks } from '../../../../api/src/modules/live/retrieval';

export interface CatchUpJob {
  sessionId: string;
  minutes: number;
}
export interface CatchUpResult {
  summary: string;
  fromSeq: number;
  toSeq: number;
}

const BUDGET_MS = 8_000;
/** Hard cap on transcript text sent to the model (from the newest end). */
const MAX_CHARS = 6_000;

export default defineJob<CatchUpJob, CatchUpResult>({
  name: 'catchup',
  timeoutMs: BUDGET_MS,
  async run({ sessionId, minutes }) {
    const started = Date.now();
    const chunks = await lastTranscriptChunks(sessionId, minutes);
    if (chunks.length === 0) return { summary: '', fromSeq: 0, toSeq: 0 };

    // Keep the newest lines that fit the cap.
    const lines: string[] = [];
    let size = 0;
    let fromSeq = chunks[chunks.length - 1]!.seq;
    for (let i = chunks.length - 1; i >= 0; i--) {
      const t = chunks[i]!.text.trim();
      if (size + t.length > MAX_CHARS) break;
      lines.unshift(t);
      size += t.length + 1;
      fromSeq = chunks[i]!.seq;
    }
    const toSeq = chunks[chunks.length - 1]!.seq;

    const { text } = await llm({
      purpose: 'catchup',
      model: 'fast',
      timeoutMs: Math.max(1_000, BUDGET_MS - 500 - (Date.now() - started)),
      maxTokens: 300,
      messages: [
        {
          role: 'system',
          content:
            'You help a conference attendee who stepped out of a talk catch up. Summarize the live caption excerpt in 3 to 5 short bullet points, in plain language, using only what the excerpt says. No preamble. Captions come from speech recognition and may contain errors.',
        },
        { role: 'user', content: `Last ${minutes} minutes of captions:\n${lines.join('\n')}` },
      ],
    });
    return { summary: text.trim(), fromSeq, toSeq };
  },
});
