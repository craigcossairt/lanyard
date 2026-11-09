import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Session } from '@lanyard/contracts';
import { cachedGeneration } from './generation';
import { generatePlan } from './plan';
import type { Generate } from './runtime';

test('plan smoke rejects invented ids, removes overlaps and caches pending work', async () => {
  const session: Session = {
    id: 'a',
    eventId: 'event',
    roomId: 'room',
    title: 'Kernel safety',
    abstract: 'fixture',
    track: 'Security',
    level: 'Beginner',
    tags: [],
    speakerIds: [],
    speakerNames: [],
    startsAt: '2026-11-09T18:00:00Z',
    endsAt: '2026-11-09T19:00:00Z',
    status: 'scheduled',
  };
  const candidates = [
    session,
    { ...session, id: 'b', startsAt: '2026-11-09T18:30:00Z' },
    { ...session, id: 'c', startsAt: '2026-11-09T19:00:00Z', endsAt: '2026-11-09T20:00:00Z' },
  ];
  const generate: Generate = async (input) => {
    assert.equal(input.model, 'chat');
    assert.equal(input.timeoutMs, 20000);
    return {
      text: JSON.stringify({
        plan: ['c', 'a', 'b'].map((sessionId) => ({ sessionId, reason: 'fixture' })),
        summary: 'fixture',
      }),
      model: 'fixture',
      inputTokens: 1,
      outputTokens: 1,
    };
  };
  const result = await generatePlan('event', { interests: 'kernel' }, candidates, generate);
  assert.deepEqual(
    result.plan.map((p) => p.sessionId),
    ['a', 'c'],
  );
  await assert.rejects(
    generatePlan('other-event', { interests: 'kernel' }, candidates, generate),
    /outside/,
  );
  const invented: Generate = async () => ({
    text: '{"plan":[{"sessionId":"invented","reason":"fixture"}],"summary":"fixture"}',
    model: 'fixture',
    inputTokens: 1,
    outputTokens: 1,
  });
  await assert.rejects(
    generatePlan('event', { interests: 'kernel' }, candidates, invented),
    /outside/,
  );
  let finish!: (value: number) => void;
  let calls = 0;
  const work = () => {
    calls++;
    return new Promise<number>((resolve) => {
      finish = resolve;
    });
  };
  await assert.rejects(cachedGeneration('smoke', 'fixture', work, Date.now() + 5), /running/);
  finish(42);
  assert.equal(await cachedGeneration('smoke', 'fixture', work, Date.now() + 100), 42);
  assert.equal(calls, 1);
});
