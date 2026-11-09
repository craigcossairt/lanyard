// Module registration pattern. Each workstream owns one folder under src/modules/<name>/
// with an index.ts that default-exports defineModule({...}), then adds ONE line to
// src/modules/index.ts. Routes are mounted under /api.
//
//   // src/modules/live/index.ts
//   export default defineModule({
//     name: 'live',
//     async register(app, ctx) {
//       app.post('/sessions/:id/signals', { preHandler: requireRole('attendee') }, async (req) => {...});
//     },
//   });
import type { FastifyInstance } from 'fastify';
import type { ModuleContext } from './context';

export interface LanyardModule {
  name: string;
  register(app: FastifyInstance, ctx: ModuleContext): void | Promise<void>;
}

export const defineModule = (m: LanyardModule): LanyardModule => m;

export async function registerModules(
  app: FastifyInstance,
  ctx: ModuleContext,
  modules: LanyardModule[],
): Promise<void> {
  for (const m of modules) {
    // Each module is an encapsulated plugin, so hooks it adds stay inside it.
    await app.register(async (scope) => m.register(scope, ctx), { prefix: '/api' });
    ctx.logger.info({ module: m.name }, 'module registered');
  }
}
