import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { HealthResponse } from '@lanyard/contracts';
import type { ModuleContext } from '../../api/src/core/context';
import { HttpError, registerErrorHandler } from '../../api/src/core/errors';
import type { JobDef } from '../../api/src/core/jobs';
import { logger } from '../../api/src/core/logger';

const tracer = trace.getTracer('lanyard-worker');
const DEFAULT_JOB_TIMEOUT_MS = 25_000;

const inflight = new Set<Promise<unknown>>();

/** Wait (up to maxMs) for running jobs to finish; used on SIGTERM before closing deps. */
export async function drainJobs(maxMs = 10_000): Promise<void> {
  if (inflight.size === 0) return;
  logger.info({ jobs: inflight.size }, 'draining jobs');
  await Promise.race([Promise.allSettled([...inflight]), new Promise((r) => setTimeout(r, maxMs))]);
}

/** Run one job inside a `job.<name>` span; tracked so shutdown can drain it. */
export function runInSpan<R>(job: JobDef, payload: unknown, ctx: ModuleContext): Promise<R> {
  const p = runTraced<R>(job, payload, ctx);
  inflight.add(p);
  void p.then(
    () => inflight.delete(p),
    () => inflight.delete(p),
  );
  return p;
}

function runTraced<R>(job: JobDef, payload: unknown, ctx: ModuleContext): Promise<R> {
  return tracer.startActiveSpan(`job.${job.name}`, async (span) => {
    try {
      return (await job.run(payload, ctx)) as R;
    } catch (err) {
      span.recordException({
        name: (err as Error).name ?? 'Error',
        message: `job ${job.name} failed`,
      });
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}

// Worker HTTP server: health routes plus POST /jobs/:name (internal only; the worker
// Service is ClusterIP and the public URL routes only to the app Service).
export function buildWorker(version: string, jobs: JobDef[], ctx?: ModuleContext): FastifyInstance {
  const app = Fastify({
    loggerInstance: logger as FastifyBaseLogger,
    bodyLimit: 1024 * 1024,
    forceCloseConnections: true,
  });
  registerErrorHandler(app);

  const body = (): HealthResponse => ({ status: 'ok', role: 'worker', version });
  app.get('/healthz', { logLevel: 'warn' }, async () => body());
  app.get('/readyz', { logLevel: 'warn' }, async () => body());

  const byName = new Map(jobs.map((j) => [j.name, j]));
  app.post<{
    Params: { name: string };
    Body: { payload?: unknown; wait?: boolean; timeoutMs?: number };
  }>('/jobs/:name', async (req, reply) => {
    const job = byName.get(req.params.name);
    if (!job) throw new HttpError(404, 'job_not_found', `No job ${req.params.name}`);
    if (!ctx) throw new HttpError(503, 'worker_not_ready', 'Worker context not initialised');
    const payload = req.body?.payload ?? {};
    if (req.body?.wait === false) {
      // Runs in the request's trace; failures are on the span and logged once here.
      void runInSpan(job, payload, ctx).catch((err: unknown) =>
        logger.warn({ job: job.name, err: (err as Error).name }, 'background job failed'),
      );
      return reply.code(202).send({ accepted: true });
    }
    // The caller (runJob) sends its budget and waits a little longer, so this 504 wins.
    const asked = Number(req.body?.timeoutMs);
    const timeoutMs =
      Number.isFinite(asked) && asked > 0 ? asked : (job.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS);
    let timer: NodeJS.Timeout | undefined;
    const result = await Promise.race([
      runInSpan(job, payload, ctx),
      new Promise((_, rej) => {
        timer = setTimeout(
          () => rej(new HttpError(504, 'job_timeout', `Job ${job.name} timed out`)),
          timeoutMs,
        );
      }),
    ]).finally(() => clearTimeout(timer));
    return { result };
  });
  return app;
}

/** Start `everySec` timers; a run is skipped while the previous one is still going. */
export function startScheduler(jobs: JobDef[], ctx: ModuleContext): () => void {
  const timers = jobs
    .filter((j) => j.everySec && j.everySec > 0)
    .map((job) => {
      let running = false;
      return setInterval(() => {
        if (running) return;
        running = true;
        runInSpan(job, {}, ctx)
          .catch((err: unknown) =>
            logger.warn({ job: job.name, err: (err as Error).name }, 'scheduled job failed'),
          )
          .finally(() => (running = false));
      }, job.everySec! * 1000);
    });
  return () => timers.forEach(clearInterval);
}
