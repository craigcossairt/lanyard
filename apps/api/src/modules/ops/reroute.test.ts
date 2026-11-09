import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RealtimeMessage, type OpsSnapshot, type Session } from '@lanyard/contracts';
import type { ModuleContext } from '../../core/context';
import { rankDestinations } from './candidates';
import { createReroute } from './reroute';

test('reroute picks nearby seats, bounds offers, and accepts only once for the owner/event', async () => {
  const source: OpsSnapshot['rooms'][number] = {
    room: {
      id: 'main',
      eventId: 'cnh-demos',
      name: 'Main Stage',
      capacity: 30,
      floor: 1,
      x: 0,
      y: 0,
      accessibility: { stepFree: true, hearingLoop: false, quiet: false },
    },
    occupancy: 27,
    ratio: 0.9,
    signals: {},
    sessionId: 'main-talk',
  };
  const target = {
    ...source,
    room: { ...source.room, id: 'side', name: 'Side Stage', capacity: 10, x: 10 },
    occupancy: 7,
    ratio: 0.7,
  };
  const now = Date.parse('2026-11-09T20:00:00Z');
  const session: Session = {
    id: 'hallway',
    eventId: 'cnh-demos',
    roomId: 'side',
    title: 'Hallway Track: open Q&A',
    startsAt: '2026-11-09T19:00:00Z',
    endsAt: '2026-11-09T21:00:00Z',
    status: 'live',
    abstract: '',
    track: '',
    level: '',
    tags: [],
    speakerIds: [],
    speakerNames: [],
  };
  const destinations = rankDestinations(
    source,
    [source, target],
    [
      { session: { ...session, id: 'wrong-event', eventId: 'other' }, score: 99 },
      { session: { ...session, id: 'ended', status: 'ended' }, score: 99 },
      { session, score: 1 },
    ],
    now,
  );
  assert.equal(destinations.length, 1);
  assert.equal(destinations[0]?.seats, 1);
  assert.equal(
    rankDestinations(source, [source, { ...target, occupancy: 9 }], [{ session, score: 1 }], now)
      .length,
    0,
  );
  const offers = new Map<string, Record<string, string>>();
  const accepted = new Set<string>();
  const messages: RealtimeMessage[] = [];
  const expiries: number[] = [];
  const transaction = {
    hset(key: string, value: Record<string, string>) {
      offers.set(key, value);
      return this;
    },
    expire(_key: string, seconds: number) {
      expiries.push(seconds);
      return this;
    },
    async exec() {
      return [[null, 1]];
    },
  };
  const ctx = {
    kv: {
      async set() {
        return 'OK';
      },
      async smembers() {
        return ['attendee1', 'attendee2'];
      },
      multi() {
        return transaction;
      },
      async hgetall(key: string) {
        return offers.get(key) ?? {};
      },
      async eval(_lua: string, _count: number, key: string, _acceptedKey: string, owner: string) {
        if (offers.get(key)?.anonId !== owner) return -1;
        if (accepted.has(key)) return 0;
        accepted.add(key);
        return 1;
      },
    },
    bus: {
      async publish(channel: string, message: RealtimeMessage) {
        assert.equal(channel, 'user:attendee1');
        messages.push(RealtimeMessage.parse(message));
      },
    },
  } as unknown as ModuleContext;
  const reroute = createReroute(ctx, {
    readOps: async () => ({
      snapshot: {
        rooms: [source, target],
        alerts: [
          {
            id: 'overflow',
            eventId: 'cnh-demos',
            roomId: 'main',
            kind: 'overflow',
            severity: 'crit',
            openedAt: new Date(now).toISOString(),
          },
        ],
      },
      attendees: new Map(),
    }),
    findDestinations: async () => destinations,
    getRooms: async (eventId) => (eventId === 'cnh-demos' ? [source.room, target.room] : []),
  });
  assert.deepEqual(await reroute.suggest('cnh-demos', 'overflow'), {
    suggested: 1,
    toSessionIds: ['hallway'],
  });
  assert.deepEqual(expiries, [900]);
  const message = messages[0];
  assert.equal(message?.type, 'reroute.suggested');
  if (message?.type !== 'reroute.suggested') throw new Error('missing offer');
  const id = message.payload.suggestionId!;
  await assert.rejects(reroute.accept('cnh-demos', 'attendee2', id), { status: 404 });
  await assert.rejects(reroute.accept('other', 'attendee1', id), { status: 403 });
  assert.deepEqual(await reroute.accept('cnh-demos', 'attendee1', id), {
    accepted: true,
    sessionId: 'hallway',
  });
  assert.deepEqual(await reroute.accept('cnh-demos', 'attendee1', id), {
    accepted: false,
    sessionId: 'hallway',
  });
  offers.clear();
  await assert.rejects(reroute.accept('cnh-demos', 'attendee1', id), { status: 404 });
});
