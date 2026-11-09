import { Id, SearchQuery, PlanMyDayRequest } from '@lanyard/contracts';
import { authOf, requireAuth, requireRole } from '../../core/auth';
import { HttpError, parse } from '../../core/errors';
import { defineModule } from '../../core/module';
import { searchSessions } from './search';
import { planMyDay } from './plan';

export default defineModule({
  name: 'search',
  async register(app) {
    app.post<{ Params: { eventId: string } }>(
      '/events/:eventId/plan-my-day',
      { preHandler: requireRole('attendee') },
      async (req, reply) => {
        const deadline = Date.now() + 7_500;
        const eventId = parse(Id, req.params.eventId);
        if (authOf(req).eventId !== eventId)
          throw new HttpError(403, 'forbidden', 'Token is for another event');
        try {
          return await planMyDay(eventId, parse(PlanMyDayRequest, req.body), deadline);
        } catch (error) {
          if (error instanceof HttpError && error.code === 'generation_pending')
            reply.header('Retry-After', '2');
          throw error;
        }
      },
    );
    app.get<{ Params: { eventId: string } }>(
      '/events/:eventId/search',
      { preHandler: requireAuth() },
      async (req) => {
        const eventId = parse(Id, req.params.eventId);
        if (authOf(req).eventId !== eventId)
          throw new HttpError(403, 'forbidden', 'Token is for another event');
        return searchSessions(eventId, parse(SearchQuery, req.query));
      },
    );
  },
});
