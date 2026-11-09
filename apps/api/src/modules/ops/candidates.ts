import { ES_INDICES, Session, type OpsSnapshot } from '@lanyard/contracts';
import { es } from '../../core/es';
import { getNowNext } from '../../core/events';
import { HttpError } from '../../core/errors';

export type Destination = { session: Session; seats: number; distance: number; score: number };

export function rankDestinations(
  sourceRoom: OpsSnapshot['rooms'][number],
  rooms: OpsSnapshot['rooms'],
  hits: { session: Session; score: number }[],
  now: number,
): Destination[] {
  return hits
    .flatMap(({ session, score }) => {
      const target = rooms.find((s) => s.room.id === session.roomId);
      if (
        !target ||
        session.eventId !== sourceRoom.room.eventId ||
        target.room.id === sourceRoom.room.id ||
        session.status === 'ended' ||
        Date.parse(session.endsAt) <= now ||
        Date.parse(session.startsAt) > now + 30 * 60_000
      )
        return [];
      // Keep the destination under the same 90% SLO; don't reroute into another incident.
      const seats = Math.max(0, Math.ceil(target.room.capacity * 0.9) - 1 - target.occupancy);
      const distance =
        Math.abs(target.room.floor - sourceRoom.room.floor) * 1000 +
        Math.hypot(target.room.x - sourceRoom.room.x, target.room.y - sourceRoom.room.y);
      return seats ? [{ session, seats, distance, score }] : [];
    })
    .sort(
      (a, b) =>
        Number(Date.parse(a.session.startsAt) > now) -
          Number(Date.parse(b.session.startsAt) > now) ||
        a.distance - b.distance ||
        b.score - a.score,
    )
    .slice(0, 3);
}

export async function findDestinations(
  eventId: string,
  source: OpsSnapshot['rooms'][number],
  rooms: OpsSnapshot['rooms'],
): Promise<Destination[]> {
  const now = new Date();
  const { now: sessions } = await getNowNext(eventId, now);
  const session = sessions.find((s) => s.id === source.sessionId);
  if (!session) throw new HttpError(409, 'no_current_session', 'No current session to reroute');
  const result = await es(ES_INDICES.sessions, 'reroute', (client, options) =>
    client.search(
      {
        index: ES_INDICES.sessions,
        size: 50,
        query: {
          bool: {
            filter: [
              { term: { eventId } },
              { range: { endsAt: { gt: now.toISOString() } } },
              { range: { startsAt: { lte: new Date(now.getTime() + 30 * 60_000).toISOString() } } },
            ],
            must_not: [{ term: { roomId: source.room.id } }, { term: { status: 'ended' } }],
            // Rerouting is ordered by start time and physical distance below.
            // Optional semantic inference must not delay finding available seats.
          },
        },
      },
      options,
    ),
  );
  const hits = result.hits.hits.flatMap((hit) => {
    const parsed = Session.safeParse({ id: hit._id, ...(hit._source as object) });
    return parsed.success ? [{ session: parsed.data, score: hit._score ?? 0 }] : [];
  });
  return rankDestinations(source, rooms, hits, now.getTime());
}
