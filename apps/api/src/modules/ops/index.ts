import { channels, Id, OpsSnapshot, RoomHistory } from '@lanyard/contracts';
import { authOf, requireRole } from '../../core/auth';
import { HttpError, parse } from '../../core/errors';
import { defineModule } from '../../core/module';
import { openSse } from '../../core/sse';
import { opsUnavailable, readOps } from './snapshot';
import { createOpsLoop, historyKey } from './loop';

export function createOpsModule(read = readOps) {
  return defineModule({
    name: 'ops',
    register(app, ctx) {
      const loop = createOpsLoop(ctx, read);
      app.addHook('onReady', async () => {
        loop.start();
      });
      app.addHook('onClose', async () => {
        await loop.close();
      });
      app.addHook('preHandler', requireRole('organizer'));
      app.addHook('preHandler', async (req) => {
        const eventId = parse(Id, (req.params as { eventId: string }).eventId);
        if (authOf(req).eventId !== eventId) {
          throw new HttpError(403, 'forbidden', 'Token is for another event');
        }
      });
      app.get<{ Params: { eventId: string } }>('/events/:eventId/ops', async (req) => {
        const { snapshot } = await read(ctx, req.params.eventId);
        const result = OpsSnapshot.safeParse(snapshot);
        if (!result.success) opsUnavailable(ctx, req.params.eventId, 'Invalid live snapshot');
        return result.data;
      });
      app.get<{ Params: { eventId: string } }>('/events/:eventId/ops/stream', (req, reply) => {
        openSse(req, reply, { channels: [channels.ops(req.params.eventId)] });
      });
      app.get<{ Params: { eventId: string; roomId: string } }>(
        '/events/:eventId/rooms/:roomId/history',
        async (req) => {
          const roomId = parse(Id, req.params.roomId);
          if (!ctx.kv) throw new HttpError(503, 'ops_unavailable', 'Live state is not configured');
          const raw = await ctx.kv.lrange(historyKey(req.params.eventId, roomId), 0, 179);
          return RoomHistory.parse({ points: raw.reverse().map((point) => JSON.parse(point)) });
        },
      );
    },
  });
}

export default createOpsModule();
