import { channels, Id, OpsSnapshot, RoomHistory, RerouteAcceptRequest, SimulationControlRequest, SimulationStatus } from '@lanyard/contracts';
import { authOf, requireAuth, requireRole } from '../../core/auth';
import { HttpError, parse } from '../../core/errors';
import { defineModule } from '../../core/module';
import { openSse } from '../../core/sse';
import { opsUnavailable, readOps } from './snapshot';
import { createOpsLoop, historyKey } from './loop';
import { createSimulation } from './simulation';
import { createReroute } from './reroute';

export function createOpsModule(read = readOps) {
  return defineModule({
    name: 'ops',
    register(app, ctx) {
      const loop = createOpsLoop(ctx, read);
      const reroute = createReroute(ctx);
      const organizer = { preHandler: requireRole('organizer') };
      app.addHook('onReady', async () => {
        loop.start();
      });
      app.addHook('onClose', async () => {
        await loop.close();
      });
      const simulation = createSimulation(app, ctx);
      app.addHook('onReady', async () => simulation.start());
      app.addHook('onClose', async () => simulation.close());
      app.addHook('preHandler', requireAuth());
      app.addHook('preHandler', async (req) => {
        const eventId = parse(Id, (req.params as { eventId: string }).eventId);
        if (authOf(req).eventId !== eventId) {
          throw new HttpError(403, 'forbidden', 'Token is for another event');
        }
      });
      app.get<{ Params: { eventId: string } }>('/events/:eventId/ops', organizer, async (req) => {
        const { snapshot } = await read(ctx, req.params.eventId);
        const result = OpsSnapshot.safeParse(snapshot);
        if (!result.success) opsUnavailable(ctx, req.params.eventId, 'Invalid live snapshot');
        return result.data;
      });
      app.get<{ Params: { eventId: string } }>(
        '/events/:eventId/ops/stream',
        organizer,
        (req, reply) => {
          openSse(req, reply, { channels: [channels.ops(req.params.eventId)] });
        },
      );
      app.get<{ Params: { eventId: string; roomId: string } }>(
        '/events/:eventId/rooms/:roomId/history',
        organizer,
        async (req) => {
          const roomId = parse(Id, req.params.roomId);
          if (!ctx.kv) throw new HttpError(503, 'ops_unavailable', 'Live state is not configured');
          try {
            const raw = await ctx.kv.lrange(historyKey(req.params.eventId, roomId), 0, 179);
            return RoomHistory.parse({ points: raw.reverse().map((point) => JSON.parse(point)) });
          } catch {
            opsUnavailable(ctx, req.params.eventId, 'Room history is temporarily unavailable');
          }
        },
      );
      app.get<{ Params: { eventId: string } }>('/events/:eventId/ops/simulation', organizer, async req =>
        SimulationStatus.parse(await simulation.status(req.params.eventId)));
      app.post<{ Params: { eventId: string } }>('/events/:eventId/ops/simulation', organizer, async req => {
        const body = parse(SimulationControlRequest, req.body);
        return SimulationStatus.parse(await simulation.control(req.params.eventId, body.running, body.attendees));
      });
      app.post<{ Params: { eventId: string; id: string } }>(
        '/events/:eventId/alerts/:id/reroute',
        organizer,
        (req) => {
          return reroute.suggest(req.params.eventId, parse(Id, req.params.id));
        },
      );
      app.post<{ Params: { eventId: string } }>(
        '/events/:eventId/reroute/accept',
        { preHandler: requireRole('attendee') },
        (req) => {
          const { suggestionId } = parse(RerouteAcceptRequest, req.body);
          return reroute.accept(req.params.eventId, authOf(req).sub, suggestionId);
        },
      );
    },
  });
}

export default createOpsModule();
