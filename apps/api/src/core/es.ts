// Elasticsearch wrapper: every call gets a span `es.<index>.<op>`, a 2 s timeout and
// error recording. Modules call `es(index, op, (client, opts) => client.search(..., opts))`.
import { Client, type TransportRequestOptions } from '@elastic/elasticsearch';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { EsIndex } from '@lanyard/contracts';
import { HttpError } from './errors';

export const ES_TIMEOUT_MS = 2_000;
const tracer = trace.getTracer('lanyard-es');
let client: Client | undefined;

export function initEs(url: string | undefined, apiKey: string | undefined): Client | undefined {
  if (!url || !apiKey) return undefined;
  client = new Client({
    node: url,
    auth: { apiKey },
    requestTimeout: ES_TIMEOUT_MS,
    maxRetries: 1,
  });
  return client;
}

export function esClient(): Client {
  if (!client) throw new HttpError(503, 'es_unavailable', 'Search backend is not configured');
  return client;
}

export const esConfigured = (): boolean => client !== undefined;

/**
 * Run one ES operation inside a span with an explicit timeout.
 * Never put query text in span attributes: only index and op.
 */
export async function es<T>(
  index: EsIndex | 'multi',
  op: string,
  fn: (c: Client, opts: TransportRequestOptions) => Promise<T>,
  timeoutMs = ES_TIMEOUT_MS,
): Promise<T> {
  const c = esClient();
  return tracer.startActiveSpan(
    `es.${index}.${op}`,
    {
      attributes: {
        'db.system': 'elasticsearch',
        'db.collection.name': index,
        'db.operation.name': op,
      },
    },
    async (span) => {
      try {
        return await fn(c, { requestTimeout: timeoutMs, maxRetries: 1 });
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        const status = (err as { meta?: { statusCode?: number } }).meta?.statusCode;
        if (status === 404) throw new HttpError(404, 'not_found', `Not found in ${index}`);
        throw new HttpError(503, 'es_unavailable', `Search backend error (${op})`);
      } finally {
        span.end();
      }
    },
  );
}

/** Tiny TTL cache for slow-changing reads (events, rooms): 30 s by default. */
const cache = new Map<string, { at: number; value: Promise<unknown> }>();
export function cached<T>(key: string, fn: () => Promise<T>, ttlMs = 30_000): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key)); // don't cache failures
  return value;
}
