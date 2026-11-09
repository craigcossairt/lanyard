import { buildWorker } from './server';

// Worker bootstrap: same image as the API, selected with ROLE=worker. Listens on PORT.
async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 8080);
  const app = buildWorker(process.env.APP_VERSION ?? 'dev');

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
