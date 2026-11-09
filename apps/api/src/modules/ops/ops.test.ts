import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Room, Session, SignalType } from '@lanyard/contracts';
import type { ModuleContext } from '../../core/context';
import { loadConfig } from '../../core/config';
import { buildServer } from '../../core/server';
import { signToken } from '../../core/tokens';
import { createOpsModule } from './index';
import { readOps } from './snapshot';

test('ops reads bounded live counts and enforces organizer/event authorization', async () => {
  const room = Room.parse({
    id: 'main',
    eventId: 'demo',
    name: 'Main Stage',
    capacity: 30,
    floor: 1,
    x: 0,
    y: 0,
    accessibility: { stepFree: true, hearingLoop: false, quiet: false },
  });
  const session = Session.parse({
    id: 'talk',
    eventId: 'demo',
    roomId: room.id,
    title: 'Demo',
    abstract: '',
    track: '',
    level: '',
    tags: [],
    speakerIds: [],
    speakerNames: [],
    status: 'live',
    startsAt: '2026-11-09T19:00:00Z',
    endsAt: '2026-11-09T21:00:00Z',
  });
  const commands: unknown[][] = [];
  let rawAlerts: string | null = null;
  const pipeline = {
    get(key: string) {
      commands.push(['get', key]);
      return this;
    },
    scard(key: string) {
      commands.push(['scard', key]);
      return this;
    },
    zcount(...args: unknown[]) {
      commands.push(['zcount', ...args]);
      return this;
    },
    async exec() {
      return [rawAlerts, 27, 26, 4, ...SignalType.options.map((t) => (t === 'lost' ? 5 : 0))].map(
        (v) => [null, v],
      );
    },
  };
  const ctx = {
    kv: { pipeline: () => pipeline },
    logger: { warn() {} },
  } as unknown as ModuleContext;
  const at = new Date('2026-11-09T20:00:00Z');
  const reading = await readOps(ctx, 'demo', at, {
    getRooms: async () => [room],
    getNowNext: async () => ({ now: [session], next: [] }),
  });
  assert.equal(reading.snapshot.rooms[0]?.ratio, 0.9);
  assert.equal(reading.snapshot.rooms[0]?.questionCount, 4);
  assert.equal(reading.snapshot.rooms[0]?.signals.lost, 5);
  assert.equal(reading.attendees.get('talk'), 26);
  for (const invalid of ['not json', '[{}]']) {
    rawAlerts = invalid;
    await assert.rejects(
      readOps(ctx, 'demo', at, {
        getRooms: async () => [room],
        getNowNext: async () => ({ now: [session], next: [] }),
      }),
      { status: 503, code: 'ops_unavailable' },
    );
  }
  assert.deepEqual(commands.at(-1), [
    'zcount',
    'signals:talk:too_hot',
    at.getTime() - 60000,
    '+inf',
  ]);
  const key = 'ops-test-signing-key';
  const app = await buildServer(
    {
      ...loadConfig(),
      tokenSigningKey: key,
      esUrl: undefined,
      valkeyUrl: undefined,
      webDistDir: '/nonexistent',
    },
    [createOpsModule(async () => reading)],
  );
  try {
    const url = '/api/events/demo/ops';
    assert.equal((await app.inject(url)).statusCode, 401);
    for (const [role, eventId, status] of [
      ['attendee', 'demo', 403],
      ['organizer', 'other', 403],
      ['organizer', 'demo', 200],
    ] as const) {
      const token = signToken(key, { sub: 'test', role, eventId }, 60).token;
      const response = await app.inject({ url, headers: { authorization: `Bearer ${token}` } });
      assert.equal(response.statusCode, status);
      if (status === 200) assert.equal(response.json().rooms[0].occupancy, 27);
      const simulation = await app.inject({
        method: 'POST', url: '/api/events/demo/ops/simulation',
        headers: { authorization: `Bearer ${token}` }, payload: { running: true, attendees: 201 },
      });
      assert.equal(simulation.statusCode, status === 200 ? 400 : status);
    }
  } finally {
    await app.close();
  }
});
