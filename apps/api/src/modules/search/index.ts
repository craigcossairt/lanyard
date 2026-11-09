import { Id, SearchQuery } from '@lanyard/contracts';
import { authOf, requireAuth } from '../../core/auth';
import { HttpError, parse } from '../../core/errors';
import { defineModule } from '../../core/module';
import { searchSessions } from './search';

export default defineModule({
  name: 'search',
  async register(app) {
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
