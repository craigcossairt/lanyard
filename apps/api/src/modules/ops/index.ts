import { channels, Id, OpsSnapshot } from '@lanyard/contracts';
import { authOf, requireRole } from '../../core/auth';
import { HttpError, parse } from '../../core/errors';
import { defineModule } from '../../core/module';
import { openSse } from '../../core/sse';
import { readOps } from './snapshot';

export function createOpsModule(read = readOps) {
  return defineModule({
    name: 'ops',
    register(app, ctx) {
      app.addHook('preHandler', requireRole('organizer'));
      app.addHook('preHandler', async (req) => {
        const eventId = parse(Id, (req.params as { eventId: string }).eventId);
        if (authOf(req).eventId !== eventId) {
          throw new HttpError(403, 'forbidden', 'Token is for another event');
        }
      });
      app.get<{ Params: { eventId: string } }>('/events/:eventId/ops', async (req) => {
        const { snapshot } = await read(ctx, req.params.eventId);
        return OpsSnapshot.parse(snapshot);
      });
      app.get<{ Params: { eventId: string } }>('/events/:eventId/ops/stream', (req, reply) => {
        openSse(req, reply, { channels: [channels.ops(req.params.eventId)] });
      });
    },
  });
}

export default createOpsModule();
