// Telemetry first: it must patch http/fastify/ioredis/pino before they load.
import './core/telemetry';
import { loadConfig } from './core/config';
import { closeContext } from './core/context';
import { buildServer } from './core/server';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildServer(config);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await closeContext();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err: unknown) => {
  console.error('fatal: api failed to start', err);
  process.exit(1);
});
