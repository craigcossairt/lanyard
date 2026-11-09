import { randomUUID } from 'node:crypto';
import { metrics } from '@opentelemetry/api';
import { channels, METRICS, realtime, type RerouteAcceptResponse } from '@lanyard/contracts';
import type { ModuleContext } from '../../core/context';
import { HttpError } from '../../core/errors';
import { getRooms } from '../../core/events';
import { findDestinations } from './candidates';
import { opsUnavailable, readOps } from './snapshot';

const meter = metrics.getMeter('lanyard');
const suggested = meter.createCounter(METRICS.rerouteSuggested);
const accepted = meter.createCounter(METRICS.rerouteAccepted);
const TTL_SECONDS = 15 * 60;
const MAX_RECIPIENTS = 200;

const acceptOnce = `
  if redis.call('HGET', KEYS[1], 'anonId') ~= ARGV[1] then return -1 end
  if redis.call('SET', KEYS[2], '1', 'NX', 'EX', ARGV[2]) then return 1 end
  return 0
`;

export function createReroute(ctx: ModuleContext, deps = { readOps, findDestinations, getRooms }) {
  return {
    async suggest(eventId: string, alertId: string) {
      if (!ctx.kv) throw new HttpError(503, 'ops_unavailable', 'Live state is not configured');
      const { snapshot } = await deps.readOps(ctx, eventId);
      const alert = snapshot.alerts.find((a) => a.id === alertId && a.eventId === eventId);
      if (!alert) throw new HttpError(404, 'alert_not_found', 'No such alert');
      const source = snapshot.rooms.find((s) => s.room.id === alert.roomId);
      if (alert.resolvedAt || alert.kind !== 'overflow' || !source || source.ratio < 0.9) {
        throw new HttpError(409, 'alert_not_active', 'This room no longer needs rerouting');
      }
      const destinations = await deps.findDestinations(eventId, source, snapshot.rooms);
      if (!destinations.length) return { suggested: 0, toSessionIds: [] };
      const lockKey = `ops:${eventId}:reroute:${alertId}`;
      const dispatch = randomUUID();
      let locked = false;
      try {
        // Bound repeated clicks and concurrent organizers; never overwrite another dispatch.
        const lock = await ctx.kv.set(lockKey, dispatch, 'EX', 60, 'NX');
        if (!lock)
          throw new HttpError(
            429,
            'reroute_recent',
            'Suggestions were just sent; retry in one minute',
          );
        locked = true;
        const members = (await ctx.kv.smembers(`room:${source.room.id}:members`)).slice(
          0,
          MAX_RECIPIENTS,
        );
        const available = new Map(destinations.map((d) => [d.session.roomId, d.seats]));
        const offers = members.flatMap((anonId) => {
          const target = destinations.find((d) => (available.get(d.session.roomId) ?? 0) > 0);
          if (!target) return [];
          available.set(target.session.roomId, available.get(target.session.roomId)! - 1);
          return [
            {
              suggestionId: randomUUID(),
              anonId,
              sessionId: target.session.id,
              reason: `${source.room.name} is busy. ${target.session.title} has seats nearby.`,
            },
          ];
        });
        const pipeline = ctx.kv.multi();
        for (const offer of offers) {
          const key = `reroute:${offer.suggestionId}`;
          pipeline
            .hset(key, {
              anonId: offer.anonId,
              alertId,
              fromRoomId: source.room.id,
              toSessionId: offer.sessionId,
            })
            .expire(key, TTL_SECONDS);
        }
        const stored = await pipeline.exec();
        if (!stored || stored.some(([error]) => error))
          throw new Error('suggestion storage failed');
        const delivered = await Promise.allSettled(
          offers.map(async (offer) => {
            await ctx.bus.publish(
              channels.user(offer.anonId),
              realtime('reroute.suggested', offer),
            );
            suggested.add(1, { event: eventId, room: source.room.id });
            return offer.sessionId;
          }),
        );
        const sent = delivered.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
        if (!sent.length && offers.length) throw new Error('suggestion delivery failed');
        return { suggested: sent.length, toSessionIds: [...new Set(sent)] };
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (locked)
          await ctx.kv
            .eval(
              "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
              1,
              lockKey,
              dispatch,
            )
            .catch(() => undefined);
        opsUnavailable(ctx, eventId, 'Reroute is temporarily unavailable');
      }
    },
    async accept(
      eventId: string,
      anonId: string,
      suggestionId: string,
    ): Promise<RerouteAcceptResponse> {
      if (!ctx.kv) throw new HttpError(503, 'ops_unavailable', 'Live state is not configured');
      try {
        const key = `reroute:${suggestionId}`;
        const offer = await ctx.kv.hgetall(key);
        if (!offer.anonId || offer.anonId !== anonId)
          throw new HttpError(404, 'suggestion_not_found', 'Suggestion is expired or not yours');
        const rooms = await deps.getRooms(eventId);
        if (!rooms.some((room) => room.id === offer.fromRoomId) || !offer.toSessionId)
          throw new HttpError(403, 'forbidden', 'Suggestion is for another event');
        const first = await ctx.kv.eval(acceptOnce, 2, key, `${key}:accepted`, anonId, TTL_SECONDS);
        if (first === -1) throw new HttpError(404, 'suggestion_not_found', 'Suggestion expired');
        if (first === 1) accepted.add(1, { event: eventId, room: offer.fromRoomId });
        return { accepted: first === 1, sessionId: offer.toSessionId };
      } catch (error) {
        if (error instanceof HttpError) throw error;
        opsUnavailable(ctx, eventId, 'Reroute acceptance is temporarily unavailable');
      }
    },
  };
}
