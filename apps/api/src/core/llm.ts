// LLM wrapper: one span `llm.<purpose>` per call with GenAI attributes (model, tokens),
// never prompt or completion text. Default 20 s timeout (catch-up passes 8 s), no retries.
// Use it from the worker, or behind a cache in the API (02-contracts section 8).
//   const { text } = await llm({ purpose: 'catchup', model: 'fast', messages, timeoutMs: 8000 });
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { HttpError } from './errors';

export const LLM_TIMEOUT_MS = 20_000;
const tracer = trace.getTracer('lanyard-llm');

let client: OpenAI | undefined;
let models = { chat: 'gpt-6.1-sol', fast: 'gpt-5.4-mini' };

export function initLlm(apiKey: string | undefined, chatModel: string, fastModel: string): void {
  models = { chat: chatModel, fast: fastModel };
  client = apiKey ? new OpenAI({ apiKey, maxRetries: 0, timeout: LLM_TIMEOUT_MS }) : undefined;
}

export interface LlmRequest {
  /** Short, low-cardinality purpose: 'catchup', 'cluster_label', 'plan_my_day', ... */
  purpose: string;
  /** 'chat' (LLM_MODEL_CHAT), 'fast' (LLM_MODEL_FAST) or an explicit model id. */
  model?: 'chat' | 'fast' | (string & {});
  messages: ChatCompletionMessageParam[];
  timeoutMs?: number;
  maxTokens?: number;
  /** Ask for a JSON object response (parse `text` yourself, validate with zod). */
  json?: boolean;
  temperature?: number;
}

export interface LlmResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function llm(req: LlmRequest): Promise<LlmResult> {
  if (!client) throw new HttpError(503, 'llm_unavailable', 'LLM is not configured');
  const c = client;
  const model =
    req.model === 'fast'
      ? models.fast
      : req.model === 'chat' || !req.model
        ? models.chat
        : req.model;
  return tracer.startActiveSpan(
    `llm.${req.purpose}`,
    {
      attributes: {
        'gen_ai.system': 'openai',
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': model,
        'llm.purpose': req.purpose,
      },
    },
    async (span) => {
      try {
        const res = await c.chat.completions.create(
          {
            model,
            messages: req.messages,
            ...(req.maxTokens ? { max_completion_tokens: req.maxTokens } : {}),
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
            ...(req.json ? { response_format: { type: 'json_object' as const } } : {}),
          },
          { timeout: req.timeoutMs ?? LLM_TIMEOUT_MS, maxRetries: 0 },
        );
        const out: LlmResult = {
          text: res.choices[0]?.message?.content ?? '',
          model: res.model,
          inputTokens: res.usage?.prompt_tokens ?? 0,
          outputTokens: res.usage?.completion_tokens ?? 0,
        };
        span.setAttributes({
          'gen_ai.response.model': out.model,
          'gen_ai.usage.input_tokens': out.inputTokens,
          'gen_ai.usage.output_tokens': out.outputTokens,
          'gen_ai.response.finish_reasons': [res.choices[0]?.finish_reason ?? 'unknown'],
        });
        return out;
      } catch (err) {
        const name = (err as Error).name ?? 'Error';
        span.recordException({
          name,
          message: `${name} (${(err as { status?: number }).status ?? 'no status'})`,
        });
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw new HttpError(503, 'llm_unavailable', `LLM call failed (${req.purpose})`);
      } finally {
        span.end();
      }
    },
  );
}
