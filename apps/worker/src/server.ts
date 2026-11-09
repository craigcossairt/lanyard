import Fastify, { type FastifyInstance } from 'fastify';
import type { HealthResponse } from '@lanyard/contracts';

// Worker HTTP server: health routes now; job trigger endpoints land in a later slice.
export function buildWorker(version: string): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // Method and path only: no headers, no IPs, no query strings.
      serializers: { req: (req) => ({ method: req.method, url: req.url?.split('?')[0] }) },
    },
  });

  const body = (): HealthResponse => ({ status: 'ok', role: 'worker', version });
  app.get('/healthz', { logLevel: 'warn' }, async () => body());
  app.get('/readyz', { logLevel: 'warn' }, async () => body());
  return app;
}
