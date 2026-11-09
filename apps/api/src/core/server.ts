import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { modules as defaultModules } from '../modules';
import type { Config } from './config';
import { initContext } from './context';
import { registerErrorHandler } from './errors';
import { registerHealth } from './health';
import { logger } from './logger';
import { registerModules, type LanyardModule } from './module';
import { registerSpa } from './spa';

export async function buildServer(
  config: Config,
  modules: LanyardModule[] = defaultModules,
): Promise<FastifyInstance> {
  // Shared pino instance: request logs carry method + redacted URL only
  // (no headers, no IPs, no bodies) and OTel adds trace ids.
  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });
  const ctx = initContext(config);

  registerErrorHandler(app);
  registerHealth(app, config);
  await registerModules(app, ctx, modules);
  await registerSpa(app, config);
  return app;
}
