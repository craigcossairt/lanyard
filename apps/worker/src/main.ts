import Fastify from 'fastify';
import type { HealthResponse } from '@lanyard/contracts';

// Worker bootstrap: same image as the API, selected with ROLE=worker.
// Serves /healthz and /readyz on PORT; the job runner and scheduler land in a later slice.
async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 8080);
  const version = process.env.APP_VERSION ?? 'dev';
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  const body = (): HealthResponse => ({ status: 'ok', role: 'worker', version });
  app.get('/healthz', { logLevel: 'warn' }, async () => body());
  app.get('/readyz', { logLevel: 'warn' }, async () => body());

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
}

main().catch((err: unknown) => {
  console.error('fatal: worker failed to start', err);
  process.exit(1);
});
