// Process-wide singletons built once from config: bus, Valkey KV, ES, signing key.
// Modules receive these through ModuleContext; helpers like openSse() use the getters.
import type { Redis } from 'ioredis';
import { setSigningKey } from './auth';
import { createBus, createValkeyClient, type Bus } from './bus';
import type { Config } from './config';
import { initEs } from './es';
import { initJev } from './jev';
import { initJobs } from './jobs';
import { initLlm } from './llm';
import { logger } from './logger';

export interface ModuleContext {
  config: Config;
  bus: Bus;
  /** Valkey client for counters; undefined when VALKEY_URL is unset (use a fallback). */
  kv: Redis | undefined;
  logger: typeof logger;
}

let ctx: ModuleContext | undefined;

export function initContext(config: Config): ModuleContext {
  setSigningKey(config.tokenSigningKey);
  if (!config.tokenSigningKey) logger.warn('TOKEN_SIGNING_KEY not set: auth routes return 503');
  if (!initEs(config.esUrl, config.esApiKey))
    logger.warn('ES_URL/ES_API_KEY not set: ES routes return 503');
  initJev(config.typesafeApiKey, config.openaiApiKey);
  initLlm(config.openaiApiKey, config.llmModelChat, config.llmModelFast);
  initJobs(config.workerUrl);
  ctx = {
    config,
    bus: createBus(config.valkeyUrl),
    kv: createValkeyClient(config.valkeyUrl),
    logger,
  };
  return ctx;
}

export function getContext(): ModuleContext {
  if (!ctx) throw new Error('context not initialised; call initContext(config) first');
  return ctx;
}

export const getBus = (): Bus => getContext().bus;

export async function closeContext(): Promise<void> {
  await ctx?.bus.close();
  ctx?.kv?.disconnect();
}
