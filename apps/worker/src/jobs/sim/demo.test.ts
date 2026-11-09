import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoActions, DEMO_DURATION_MS, TALK } from './demo';

test('recording timeline stages overflow, paced captions, question waves and one louder burst', () => {
  const actions = demoActions();
  assert.equal(new Set(actions.map(a => a.id)).size, actions.length);
  assert.equal(actions.filter(a => a.kind === 'join' && a.stage === 0 && a.at < 60_000).length, 20);
  assert.equal(actions.filter(a => a.kind === 'join' && a.stage === 0).length, 34);
  const captions = actions.filter(a => a.kind === 'caption');
  assert.equal(captions.length, 30);
  assert.ok(captions.every((a, i) => a.at === (i + 1) * 4000));
  assert.ok(TALK.join(' ').split(/\s+/).length >= 270);
  assert.equal(actions.filter(a => a.kind === 'question' && a.at < 60_000).length, 6);
  assert.equal(actions.filter(a => a.kind === 'signal').length, 5);
  assert.ok(actions.every(a => a.at < DEMO_DURATION_MS && a.actor < 40));
  assert.ok(actions.every(a => !('text' in a) || a.text.startsWith('SIMULATED:')));
});
