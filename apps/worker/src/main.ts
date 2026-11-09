// Telemetry first (shared with the API; tsup bundles it): loads local .env in dev and
// patches http/fastify/ioredis/pino before they load. Service name: lanyard-worker.
import { shutdownTelemetry } from '../../api/src/core/telemetry';
import { buildWorker } from './server';

// Worker bootstrap: same image as the API, selected with ROLE=worker. Listens on PORT.
async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 8080);
  const app = buildWorker(process.env.APP_VERSION ?? 'dev');

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await shutdownTelemetry();
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
