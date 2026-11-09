// OpenTelemetry bootstrap. MUST be the first import of every entrypoint (api and worker)
// so http, fastify, undici, ioredis and pino are patched before they load.
// Exporters come from standard env (OTLP http/protobuf to OTEL_EXPORTER_OTLP_ENDPOINT with
// OTEL_EXPORTER_OTLP_HEADERS). With no endpoint set, nothing starts and the app runs normally.
import './env';
import type { IncomingMessage } from 'node:http';
import { startNodeSdk } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { redactUrl } from './redact';

const role = process.env.ROLE === 'worker' ? 'worker' : 'app';
export const serviceName = process.env.OTEL_SERVICE_NAME || `lanyard-${role}`;
export const telemetryEnabled =
  Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT) && process.env.OTEL_SDK_DISABLED !== 'true';

/** Backstop: no token-like query params in span attributes. */
function redactSpanUrl(span: { setAttribute(k: string, v: string): unknown }, req: unknown): void {
  const url = (req as IncomingMessage).url;
  if (!url || !url.includes('?')) return;
  const red = redactUrl(url);
  span.setAttribute('http.target', red);
  span.setAttribute('url.query', red.slice(red.indexOf('?') + 1));
  const host = (req as IncomingMessage).headers?.host;
  if (host) span.setAttribute('url.full', `http://${host}${red}`);
}

let sdk: { shutdown(): Promise<void> } | undefined;

/** Flush and stop telemetry; entrypoints await this on SIGTERM before exiting (max 3 s). */
export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  await Promise.race([sdk.shutdown().catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
}

if (telemetryEnabled) {
  // Defaults the SDK reads from env; set here so a bare endpoint + headers is enough.
  process.env.OTEL_TRACES_EXPORTER ??= 'otlp';
  process.env.OTEL_METRICS_EXPORTER ??= 'otlp';
  process.env.OTEL_LOGS_EXPORTER ??= 'otlp';
  process.env.OTEL_EXPORTER_OTLP_PROTOCOL ??= 'http/protobuf';
  process.env.OTEL_METRIC_EXPORT_INTERVAL ??= '15000';
  process.env.OTEL_EXPORTER_OTLP_TIMEOUT ??= '5000';

  sdk = startNodeSdk({
    logLevel: 'warn',
    resourceAttributes: {
      'service.name': serviceName,
      'service.version': process.env.APP_VERSION || 'dev',
      'deployment.environment': 'hackathon',
      'deployment.environment.name': 'hackathon',
    },
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => req.url === '/healthz' || req.url === '/readyz',
          requestHook: (span, req) => redactSpanUrl(span, req),
        },
      }),
    ],
  });
}
