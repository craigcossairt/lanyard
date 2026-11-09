import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actorId, ambientAction, BATCH_SIZE, createCrowd, MAX_DURATION_MS, nextBatch } from './scenario';

test('SIMULATED crowd bounds entry, ambient work and restart-safe cleanup', () => {
  const now = Date.parse('2026-11-09T20:00:00Z');
  assert.throws(() => createCrowd('run', ['main', 'side'], 201, now));
  assert.throws(() => createCrowd('run', ['main', 'main'], 40, now));
  const crowd = createCrowd('run', ['main', 'side'], 40, now);
  const entered = [];
  while (true) {
    const batch = nextBatch(crowd, now);
    if (batch.done) break;
    assert.ok(batch.actions.length <= BATCH_SIZE);
    entered.push(...batch.actions);
    crowd.cursor += batch.actions.length;
  }
  assert.equal(entered.filter((action) => action.sessionId === 'main').length, 34);
  assert.equal(new Set(entered.map((action) => actorId(crowd, action.actor))).size, 40);
  assert.equal(ambientAction(crowd, 5).kind, 'question');
  assert.equal(ambientAction(crowd, 4).sessionId, 'side');
  crowd.cursor = 0;
  const departed = [];
  while (true) {
    const batch = nextBatch(crowd, now + MAX_DURATION_MS);
    if (batch.done) break;
    assert.ok(batch.actions.every((action) => action.kind === 'leave'));
    departed.push(...batch.actions);
    crowd.cursor += batch.actions.length;
  }
  assert.equal(departed.length, 80);
});
