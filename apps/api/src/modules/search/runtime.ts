// Temporary G1 shim approved by the orchestrator. Replace with core/llm's import
// as soon as WS0 lands it; no outbound implementation is duplicated here.
import { HttpError } from '../../core/errors';

export interface LlmInput {
  purpose: string;
  model: 'chat' | 'fast';
  messages: { role: 'system' | 'user'; content: string }[];
  timeoutMs?: number;
  maxTokens?: number;
  json?: boolean;
}
export interface LlmResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}
export type Generate = (input: LlmInput) => Promise<LlmResult>;
export const llm: Generate = async (input) => {
  const modulePath = '../../core/llm';
  let core: { llm: Generate };
  try {
    core = await import(modulePath);
  } catch {
    throw new HttpError(503, 'llm_unavailable', 'Generation backend is not configured');
  }
  return core.llm(input);
};
