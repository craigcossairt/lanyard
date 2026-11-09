import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@lanyard/contracts';
import type { Config } from './config';

// Liveness and readiness. Readiness deliberately does NOT depend on ES, Valkey or OTel:
// a down dependency degrades features, it must not take the pod out of the Service.
export function registerHealth(app: FastifyInstance, config: Config): void {
  const body = (): HealthResponse => ({ status: 'ok', role: 'app', version: config.version });
  app.get('/healthz', { logLevel: 'warn' }, async () => body());
  app.get('/readyz', { logLevel: 'warn' }, async () => body());
}
