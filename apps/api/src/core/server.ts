import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config';
import { registerHealth } from './health';
import { registerSpa } from './spa';

export async function buildServer(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    // Never log bodies: question and caption text must stay out of logs.
    disableRequestLogging: false,
  });

  registerHealth(app, config);
  await registerSpa(app, config);
  return app;
}
