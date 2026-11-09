import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupSynthetic } from './cleanup';

test('cleanupSynthetic refuses any event but cnh-demos, before touching a backend', async () => {
  for (const eventId of ['kubecon-na-2026', '', 'CNH-DEMOS'])
    await assert.rejects(
      cleanupSynthetic({ eventId, sessionIds: ['s1'], questionIds: ['q1'] }),
      (err: { status?: number; code?: string }) => err.status === 403 && err.code === 'forbidden',
    );
});

test('cleanupSynthetic bounds the id lists', async () => {
  await assert.rejects(
    cleanupSynthetic({
      eventId: 'cnh-demos',
      sessionIds: ['s1'],
      anonIds: Array.from({ length: 5_001 }, (_, i) => `a${i}`),
    }),
    (err: { code?: string }) => err.code === 'too_many_ids',
  );
});

test('cleanupSynthetic with no sessions is a no-op', async () => {
  const res = await cleanupSynthetic({ eventId: 'cnh-demos', sessionIds: [] });
  assert.equal(res.removed.questions, 0);
});
