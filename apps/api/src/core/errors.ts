// Uniform error body: { error: { code, message } } (02-contracts section 4).
import type { FastifyInstance } from 'fastify';
import { ZodError, type z } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Validate input with a contracts schema; throws a 400 with the issue paths (not values). */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const where = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new HttpError(400, 'invalid_request', where.join('; '));
  }
  return r.data;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      // Dependency failures (es_unavailable, auth_unconfigured, ...) must show up in logs;
      // the cause is already recorded on the span.
      if (err.status >= 500) req.log.warn({ code: err.code, status: err.status }, 'request failed');
      return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
      return reply
        .code(400)
        .send({ error: { code: 'invalid_request', message: 'Invalid request' } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({
        error: {
          code: (err as { code?: string }).code ?? 'bad_request',
          message: (err as Error).message,
        },
      });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'internal', message: 'Internal error' } });
  });
}
