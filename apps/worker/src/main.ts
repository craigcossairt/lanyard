// Telemetry first (shared with the API; tsup bundles it): loads local .env in dev and
// patches http/fastify/ioredis/pino before they load. Service name: lanyard-worker.
import { shutdownTelemetry } from '../../api/src/core/telemetry';
import { loadConfig } from '../../api/src/core/config';
import { closeContext, initContext } from '../../api/src/core/context';
import { jobs } from './jobs';
import { buildWorker, drainJobs, startScheduler } from './server';

// Worker bootstrap: same image as the API, selected with ROLE=worker. Listens on PORT.
async function main(): Promise<void> {
  const config = loadConfig();
  const ctx = initContext(config); // ES, bus, kv, Jev, LLM: same wrappers as the API
  const app = buildWorker(config.version, jobs, ctx);
  const stopScheduler = startScheduler(jobs, ctx);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'shutting down');
    stopScheduler();
    await app.close();
    await drainJobs(); // let accepted/scheduled jobs finish before closing ES/Valkey
    await closeContext();
    await shutdownTelemetry();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info({ jobs: jobs.map((j) => j.name) }, 'worker ready');
}

main().catch((err: unknown) => {
  console.error('fatal: worker failed to start', err);
  process.exit(1);
});
