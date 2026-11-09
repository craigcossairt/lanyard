// Shared contracts. Source of truth: docs/plan/02-contracts.md.
// Consumed as TypeScript source (no build step): Vite and tsup compile it into each app.

export const SERVICE_NAMES = {
  app: 'lanyard-app',
  worker: 'lanyard-worker',
  web: 'lanyard-web',
} as const;

export type Role = 'app' | 'worker';

export interface HealthResponse {
  status: 'ok';
  role: Role;
  version: string;
}
