// Core event data access (ES, cached 30 s) and the WS0 routes:
// POST /api/events/:eventId/join, GET /api/events/:eventId,
// POST /api/events/:eventId/role-links, GET /api/config.
import type { FastifyInstance } from 'fastify';
import {
  ES_INDICES,
  EVENT_IDS,
  Event,
  JoinRequest,
  RoleLinkRequest,
  Room,
  Session,
  type EventView,
  type JoinResponse,
  type RoleLinkResponse,
  type RuntimeConfig,
} from '@lanyard/contracts';
import { authOf, getSigningKey, requireRole } from './auth';
import type { ModuleContext } from './context';
import { HttpError, parse } from './errors';
import { cached, es } from './es';
import { joinLink, newId, randomHandle, signToken } from './tokens';

const ATTENDEE_TTL_S = 7 * 24 * 3600;

type Hit = { _id?: string; _source?: unknown };
const docs = <T>(hits: Hit[], schema: { safeParse(v: unknown): { success: boolean; data?: T } }) =>
  hits.flatMap((h) => {
    const r = schema.safeParse({ id: h._id, ...(h._source as object) });
    return r.success && r.data ? [r.data] : [];
  });

/** Event by id, or by join code if no event has that id. Cached 30 s. */
export function getEvent(idOrCode: string): Promise<Event> {
  return cached(`event:${idOrCode}`, async () => {
    const res = await es(ES_INDICES.events, 'search', (c, o) =>
      c.search(
        {
          index: ES_INDICES.events,
          size: 1,
          query: {
            bool: {
              should: [
                { ids: { values: [idOrCode] } },
                { term: { id: idOrCode } },
                { term: { joinCode: idOrCode } },
              ],
            },
          },
        },
        o,
      ),
    );
    const ev = docs(res.hits.hits as Hit[], Event)[0];
    if (!ev) throw new HttpError(404, 'event_not_found', 'No such event');
    return ev;
  });
}

export function getRooms(eventId: string): Promise<Room[]> {
  return cached(`rooms:${eventId}`, async () => {
    const res = await es(ES_INDICES.rooms, 'search', (c, o) =>
      c.search(
        {
          index: ES_INDICES.rooms,
          size: 500,
          query: { term: { eventId } },
        },
        o,
      ),
    );
    return docs(res.hits.hits as Hit[], Room).sort((a, b) => a.name.localeCompare(b.name));
  });
}

/** Sessions live now and the next start slot(s), for the event home. Cached 30 s. */
export function getNowNext(
  eventId: string,
  at = new Date(),
): Promise<{ now: Session[]; next: Session[] }> {
  return cached(`nownext:${eventId}`, async () => {
    const iso = at.toISOString();
    const res = await es(ES_INDICES.sessions, 'search', (c, o) =>
      c.search(
        {
          index: ES_INDICES.sessions,
          size: 200,
          query: { bool: { filter: [{ term: { eventId } }, { range: { endsAt: { gt: iso } } }] } },
          sort: [{ startsAt: 'asc' }],
        },
        o,
      ),
    );
    const all = docs(res.hits.hits as Hit[], Session).filter((s) => s.status !== 'ended');
    const now = all.filter((s) => s.startsAt <= iso || s.status === 'live');
    const upcoming = all.filter((s) => s.startsAt > iso && s.status !== 'live');
    const firstStart = upcoming[0]?.startsAt;
    const next = firstStart ? upcoming.filter((s) => s.startsAt === firstStart) : [];
    return { now, next };
  });
}

export function registerEventRoutes(app: FastifyInstance, ctx: ModuleContext): void {
  app.get('/api/config', async (): Promise<RuntimeConfig> => ({
    version: ctx.config.version,
    eventTz: ctx.config.eventTz,
    publicBaseUrl: ctx.config.publicBaseUrl,
    rum: ctx.config.rum,
  }));

  app.get<{ Params: { eventId: string } }>(
    '/api/events/:eventId',
    { preHandler: requireRole() },
    async (req): Promise<EventView> => {
      const claims = authOf(req);
      const full = await getEvent(req.params.eventId);
      if (claims.eventId !== full.id)
        throw new HttpError(403, 'forbidden', 'Token is for another event');
      // The join code is only for organizers (they hand it out).
      const { joinCode, ...rest } = full;
      const event = claims.role === 'organizer' ? { ...rest, joinCode } : rest;
      const [rooms, nowNext] = await Promise.all([getRooms(full.id), getNowNext(full.id)]);
      return { event, rooms, ...nowNext };
    },
  );

  app.post<{ Params: { eventId: string } }>(
    '/api/events/:eventId/join',
    async (req, reply): Promise<JoinResponse> => {
      const body = parse(JoinRequest, req.body ?? {});
      const key = getSigningKey();
      let eventId: string;
      try {
        // The path takes an event id or a join code; a body joinCode, if sent, must match.
        const ev = await getEvent(req.params.eventId);
        const code = body.joinCode?.trim().toUpperCase();
        if (code && ev.joinCode && code !== ev.joinCode.toUpperCase()) {
          throw new HttpError(403, 'bad_join_code', 'Join code does not match this event');
        }
        eventId = ev.id;
      } catch (err) {
        // ES down: still let people into the two known events so the demo survives.
        const known = Object.values(EVENT_IDS) as string[];
        if (
          err instanceof HttpError &&
          err.code === 'es_unavailable' &&
          known.includes(req.params.eventId)
        ) {
          eventId = req.params.eventId;
        } else throw err;
      }
      const anonId = newId('a');
      const handle = randomHandle();
      const { token } = signToken(
        key,
        { sub: anonId, role: 'attendee', eventId, handle },
        ATTENDEE_TTL_S,
      );
      reply.code(201);
      return { anonId, handle, token, role: 'attendee', eventId };
    },
  );

  app.post<{ Params: { eventId: string } }>(
    '/api/events/:eventId/role-links',
    { preHandler: requireRole('organizer') },
    async (req): Promise<RoleLinkResponse> => {
      const claims = authOf(req);
      if (claims.eventId !== req.params.eventId)
        throw new HttpError(403, 'forbidden', 'Token is for another event');
      const body = parse(RoleLinkRequest, req.body ?? {});
      const key = getSigningKey();
      const links = Array.from({ length: body.count }, () => {
        const { token, claims: c } = signToken(
          key,
          { sub: newId(body.role), role: body.role, eventId: claims.eventId, handle: body.label },
          body.ttlHours * 3600,
        );
        return {
          role: c.role,
          url: joinLink(ctx.config.publicBaseUrl, token),
          expiresAt: new Date(c.exp * 1000).toISOString(),
        };
      });
      return { links };
    },
  );
}
