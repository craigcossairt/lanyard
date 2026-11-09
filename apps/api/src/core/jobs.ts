// Worker jobs, shared by both sides.
// Worker side: each job folder default-exports defineJob({...}); apps/worker/src/jobs/index.ts
// lists them. API side: runJob(name, payload) POSTs to $WORKER_URL/jobs/<name>; the undici
// instrumentation adds `traceparent`, so the worker span joins the API trace.
import type { ModuleContext } from './context';
import { HttpError } from './errors';

export interface JobDef<P = unknown, R = unknown> {
  name: string;
  /** Run on a timer every N seconds (in the worker), in addition to HTTP triggers. */
  everySec?: number;
  /** Max run time before the trigger gets a 504 (the job itself keeps its own timeouts). */
  timeoutMs?: number;
  run(payload: P, ctx: ModuleContext): Promise<R>;
}

export const defineJob = <P, R>(job: JobDef<P, R>): JobDef<P, R> => job;

let workerUrl: string | undefined;
export function initJobs(url: string | undefined): void {
  workerUrl = url?.replace(/\/$/, '');
}

/**
 * Trigger a worker job. `wait: true` (default) returns the job's result; `wait: false`
 * returns once the worker accepted it (202).
 */
export async function runJob<R = unknown>(
  name: string,
  payload: unknown = {},
  /** timeoutMs: job budget on the worker (default 25 s); the HTTP call waits 2 s longer. */
  opts: { wait?: boolean; timeoutMs?: number } = {},
): Promise<R | undefined> {
  if (!workerUrl) throw new HttpError(503, 'worker_unavailable', 'WORKER_URL is not set');
  const wait = opts.wait ?? true;
  const jobTimeoutMs = opts.timeoutMs ?? 25_000;
  let res: Response;
  try {
    res = await fetch(`${workerUrl}/jobs/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload, wait, timeoutMs: jobTimeoutMs }),
      // Outlast the worker's own job timeout so its 504 job_timeout reaches the caller.
      signal: AbortSignal.timeout(wait ? jobTimeoutMs + 2_000 : 2_000),
    });
  } catch {
    throw new HttpError(503, 'worker_unavailable', `Worker unreachable for job ${name}`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as
      { error?: { code?: string; message?: string } } | undefined;
    throw new HttpError(
      res.status >= 500 ? 502 : res.status,
      body?.error?.code ?? 'job_failed',
      body?.error?.message ?? `Job ${name} failed`,
    );
  }
  return res.status === 202 ? undefined : ((await res.json()) as { result: R }).result;
}
