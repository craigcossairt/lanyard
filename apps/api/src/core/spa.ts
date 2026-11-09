import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config';

// Serves the built SPA (apps/web/dist) from `/`, with an index.html fallback so
// client-side routes like /a/schedule work on reload. /api/* misses stay JSON 404s.
export async function registerSpa(app: FastifyInstance, config: Config): Promise<void> {
  // The bundle lives in apps/api/dist, so the web build is at ../../web/dist.
  const root = config.webDistDir ?? path.resolve(__dirname, '../../web/dist');
  const hasSpa = existsSync(path.join(root, 'index.html'));
  if (hasSpa) {
    await app.register(fastifyStatic, { root, wildcard: false, index: ['index.html'] });
  } else {
    app.log.warn({ root }, 'web build not found; SPA disabled');
  }

  app.setNotFoundHandler((req, reply) => {
    const url = req.url.split('?')[0] ?? '/';
    if (hasSpa && req.method === 'GET' && !url.startsWith('/api/') && !path.extname(url)) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply
      .code(404)
      .send({ error: { code: 'not_found', message: `No route for ${req.method} ${url}` } });
  });
}
