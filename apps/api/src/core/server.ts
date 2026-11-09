import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config';
import { registerHealth } from './health';
import { reqSerializer } from './redact';
import { registerSpa } from './spa';

export async function buildServer(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // Request logs carry method + redacted URL only: no headers, no IPs, no bodies.
      serializers: { req: reqSerializer },
    },
  });

  registerHealth(app, config);
  await registerSpa(app, config);
  return app;
}
