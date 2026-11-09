import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Alert, OpsSnapshot, RealtimeMessage } from '@lanyard/contracts';
import type { ModuleContext } from '../../core/context';
import { createOpsLoop } from './loop';
import { evaluateAlerts } from './rules';

test('ops opens/resolves at rule boundaries, fences a lost lease, and records only elected readings', async () => {
  const room: OpsSnapshot['rooms'][number] = {
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
    sessionId: 'talk',
    signals: { lost: 5 },
  };
  const at = '2026-11-09T20:00:00Z';
  const opened = evaluateAlerts('cnh-demos', [room], [], at);
  assert.deepEqual(
    opened.alerts.map((a) => a.kind),
    ['overflow', 'signal_spike'],
  );
  const same = evaluateAlerts('cnh-demos', [room], opened.alerts, at);
  assert.equal(same.transitions.length, 0);
  const resolved = evaluateAlerts(
    'cnh-demos',
    [{ ...room, occupancy: 26, ratio: 26 / 30, signals: { lost: 4 } }],
    same.alerts,
    at,
  );
  assert.equal(resolved.transitions.length, 2);
  assert.ok(resolved.alerts.every((a) => a.resolvedAt === at));
  assert.equal(evaluateAlerts('cnh-demos', [room], resolved.alerts, at).transitions.length, 2);

  let allowCommit = false;
  let allowPublish = false;
  const outbox = new Map<string, unknown>();
  const published: RealtimeMessage[] = [];
  const updates: string[] = [];
  let saved: Alert[] = [];
  const ctx = {
    kv: {
      async eval(_script: string, numkeys: number, ...args: unknown[]) {
        if (numkeys === 1) return String(args[0]).includes('cnh-demos') ? 'OK' : null;
        if (!allowCommit) return 0;
        saved = JSON.parse(String(args[numkeys + 1]));
        for (const [id, message] of Object.entries(JSON.parse(String(args[numkeys + 2]))))
          outbox.set(id, message);
        return 1;
      },
      async hscan() {
        return ['0', [...outbox].flatMap(([id, message]) => [id, JSON.stringify(message)])];
      },
      async hdel(_key: string, id: string) {
        outbox.delete(id);
      },
    },
    bus: {
      async publish(_channel: string, message: RealtimeMessage) {
        if (!allowPublish) throw new Error('timeout');
        published.push(message);
      },
    },
    logger: { warn() {} },
  } as unknown as ModuleContext;
  const loop = createOpsLoop(
    ctx,
    async () => ({
      snapshot: { rooms: [room], alerts: saved },
      attendees: new Map([['talk', 26]]),
    }),
    {
      update(event) {
        updates.push(event);
      },
      clear() {},
      close() {},
    },
  );
  await loop.tick();
  assert.equal(published.length, 0);
  assert.equal(updates.length, 0);
  allowCommit = true;
  await loop.tick();
  assert.equal(published.length, 0);
  assert.equal(outbox.size, 2);
  assert.equal(updates.length, 1);
  allowPublish = true;
  await loop.tick();
  assert.equal(published.length, 2);
  assert.equal(outbox.size, 0);
  assert.deepEqual(updates, ['cnh-demos', 'cnh-demos']);
  await loop.close();
});
