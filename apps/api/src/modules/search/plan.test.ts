import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PlanMyDayResponse, type PlanSession } from '@lanyard/contracts';
import { cachedGeneration } from './generation';
import { generatePlan } from './plan';
import { localDayWindow } from './day';
import type { Generate } from './generation';

test('plan smoke rejects invented ids, removes overlaps and caches pending work', async () => {
  assert.deepEqual(localDayWindow('2026-11-10', 'America/Denver'), {
    from: '2026-11-10T07:00:00.000Z',
    to: '2026-11-11T07:00:00.000Z',
  });
  const spring = localDayWindow('2026-03-08', 'America/Denver');
  assert.equal(Date.parse(spring.to) - Date.parse(spring.from), 23 * 3600_000);
  const fall = localDayWindow('2026-11-01', 'America/Denver');
  assert.equal(Date.parse(fall.to) - Date.parse(fall.from), 25 * 3600_000);
  const session: PlanSession = {
    id: 'a',
    eventId: 'event',
    roomId: 'room',
    roomName: 'Main Stage',
    title: 'Kernel safety',
    abstract: 'fixture',
    track: 'Security',
    level: 'Beginner',
    tags: [],
    speakerIds: [],
    speakerNames: ['Fixture Speaker'],
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
        summary: 'Starts at 18:00 UTC.',
        sessions: [{ id: 'model-echo-without-full-metadata' }],
      }),
      model: 'fixture',
      inputTokens: 1,
      outputTokens: 1,
    };
  };
  const result = await generatePlan('event', { interests: 'kernel' }, candidates, 'America/Denver', generate);
  assert.deepEqual(
    result.plan.map((p) => p.sessionId),
    ['a', 'c'],
  );
  assert.deepEqual(result.sessions, [candidates[0], candidates[2]]);
  assert.equal(result.sessions[0]?.roomName, 'Main Stage');
  assert.deepEqual(result.sessions[0]?.speakerNames, ['Fixture Speaker']);
  assert.ok(PlanMyDayResponse.safeParse(result).success);
  assert.match(result.summary, /11:00.*1:00.*PM/);
  assert.match(result.summary, /America\/Denver/);
  assert.doesNotMatch(result.summary, /UTC|18:00|20:00/);
  const eastern = await generatePlan('event', { interests: 'kernel' }, candidates, 'America/New_York', generate);
  assert.match(eastern.summary, /1:00.*3:00.*PM/);
  assert.match(eastern.summary, /America\/New_York/);
  const empty = await generatePlan('event', { interests: 'kernel' }, [], 'America/Denver', generate);
  assert.deepEqual(empty.sessions, []);
  await assert.rejects(
    generatePlan('other-event', { interests: 'kernel' }, candidates, 'America/Denver', generate),
    /outside/,
  );
  const invented: Generate = async () => ({
    text: '{"plan":[{"sessionId":"invented","reason":"fixture"}],"summary":"fixture"}',
    model: 'fixture',
    inputTokens: 1,
    outputTokens: 1,
  });
  await assert.rejects(
    generatePlan('event', { interests: 'kernel' }, candidates, 'America/Denver', invented),
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
