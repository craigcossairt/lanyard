// Shared pino logger. The OTel pino instrumentation adds trace_id/span_id to every record
// inside a span and ships records over OTLP. Never log question/caption text or prefs.
import pino from 'pino';
import { reqSerializer } from './redact';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    service:
      process.env.OTEL_SERVICE_NAME ||
      `lanyard-${process.env.ROLE === 'worker' ? 'worker' : 'app'}`,
  },
  serializers: {
    req: reqSerializer,
    res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'headers.authorization',
      '*.token',
      'token',
      '*.text',
      'text',
    ],
    censor: '[REDACTED]',
  },
});
