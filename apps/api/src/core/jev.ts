// Jev (TypeSafe AI) decision wrapper: typed choice + calibrated probability in ~70-500 ms.
// Each call: 1 s timeout, no retries, span `jev.<decision>` with the chosen label and its
// probability (never the input text). If Jev fails, `fallback` runs (e.g. OpenAI moderation).
import { choice, TypeSafeClient } from '@typesafe-ai/sdk';
import OpenAI from 'openai';
import { SpanStatusCode, trace } from '@opentelemetry/api';

export const JEV_TIMEOUT_MS = 1_000;
const tracer = trace.getTracer('lanyard-jev');

type JevState = Parameters<TypeSafeClient['systemOne']>[0]['state'];
let jev: TypeSafeClient | undefined;
let openai: OpenAI | undefined;

export function initJev(typesafeKey: string | undefined, openaiKey: string | undefined): void {
  if (typesafeKey)
    jev = new TypeSafeClient({
      apiKey: typesafeKey,
      timeout: JEV_TIMEOUT_MS,
      retry: { maxRetries: 0 },
      logLevel: 'off',
    });
  if (openaiKey) openai = new OpenAI({ apiKey: openaiKey, timeout: 5_000, maxRetries: 0 });
}

export interface Decision<L extends string> {
  label: L;
  probability: number;
  source: 'jev' | 'fallback' | 'default';
}

export interface DecideOptions<L extends string> {
  /** What Jev reads: text or structured state. Never logged or put on spans. */
  state: JevState;
  /** The question, e.g. "Is this question appropriate for a public Q&A board?" */
  question: string;
  /** Allowed labels, e.g. ['allow', 'hide', 'review']. */
  labels: readonly L[];
  /** Used when Jev is unconfigured or fails. */
  fallback?: () => Promise<Omit<Decision<L>, 'source'>>;
  /** Used when both fail. */
  defaultLabel: L;
}

/** One typed decision, e.g. decide('moderation', {...}). Never throws. */
export async function decide<L extends string>(
  name: string,
  o: DecideOptions<L>,
): Promise<Decision<L>> {
  return tracer.startActiveSpan(`jev.${name}`, async (span) => {
    const finish = (d: Decision<L>) => {
      span.setAttributes({
        'jev.decision': name,
        'jev.label': d.label,
        'jev.probability': d.probability,
        'jev.source': d.source,
      });
      span.end();
      return d;
    };
    if (jev) {
      try {
        const criteria = Object.fromEntries(o.labels.map((l) => [l, null])) as Record<L, null>;
        const res = await jev.systemOne(
          { state: o.state, questions: { q: choice(o.question, criteria) } },
          { timeout: JEV_TIMEOUT_MS, retry: { maxRetries: 0 } },
        );
        const a = res.answers.q as { choice: string; probabilities: Record<string, number> };
        return finish({
          label: a.choice as L,
          probability: a.probabilities[a.choice] ?? 0,
          source: 'jev',
        });
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'jev failed, falling back' });
      }
    }
    if (o.fallback) {
      try {
        return finish({ ...(await o.fallback()), source: 'fallback' });
      } catch (err) {
        span.recordException(err as Error);
      }
    }
    return finish({ label: o.defaultLabel, probability: 0, source: 'default' });
  });
}

export type ModerationLabel = 'allow' | 'hide' | 'review';

/** Moderate an anonymous question: Jev first, OpenAI moderation as the fallback. */
export function moderate(text: string): Promise<Decision<ModerationLabel>> {
  return decide<ModerationLabel>('moderation', {
    state: { question: text, context: 'Anonymous audience question at a tech conference talk' },
    question:
      'Should this question be shown on the public Q&A board? allow = fine; hide = abusive, harassing, spam or contains personal data; review = unsure.',
    labels: ['allow', 'hide', 'review'],
    defaultLabel: 'review',
    fallback: openai
      ? async () => {
          const r = await openai!.moderations.create(
            { model: 'omni-moderation-latest', input: text },
            { timeout: 2_000 },
          );
          const flagged = r.results[0]?.flagged ?? false;
          return { label: flagged ? 'hide' : 'allow', probability: flagged ? 0.9 : 0.6 };
        }
      : undefined,
  });
}
