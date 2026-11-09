// Process-wide singletons built once from config: ES (signing key, bus and KV follow).
// Modules receive these through ModuleContext.
import type { Config } from './config';
import { initEs } from './es';
import { logger } from './logger';

export interface ModuleContext {
  config: Config;
  logger: typeof logger;
}

let ctx: ModuleContext | undefined;

export function initContext(config: Config): ModuleContext {
  if (!initEs(config.esUrl, config.esApiKey))
    logger.warn('ES_URL/ES_API_KEY not set: ES routes return 503');
  ctx = { config, logger };
  return ctx;
}

export function getContext(): ModuleContext {
  if (!ctx) throw new Error('context not initialised; call initContext(config) first');
  return ctx;
}

export async function closeContext(): Promise<void> {}
