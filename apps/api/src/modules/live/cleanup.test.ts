import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logger } from '../../core/logger';
import { cleanupSynthetic, type AppContext } from './cleanup';

// No Valkey, no bus: the guards must fire before either is touched.
const ctx = { kv: undefined, bus: undefined, logger } as unknown as AppContext;
type Input = Parameters<typeof cleanupSynthetic>[1];

test('cleanupSynthetic refuses any event but cnh-demos, before touching a backend', async () => {
  for (const eventId of ['kubecon-na-2026', '', 'CNH-DEMOS'])
    await assert.rejects(
      cleanupSynthetic(ctx, {
        eventId,
        sessionIds: ['s1'],
        questionIds: ['q1'],
        anonIds: ['sim_a1'],
      } as unknown as Input),
      (err: { status?: number; code?: string }) => err.status === 403 && err.code === 'forbidden',
    );
});

test('cleanupSynthetic bounds the id lists', async () => {
  await assert.rejects(
    cleanupSynthetic(ctx, {
      eventId: 'cnh-demos',
      sessionIds: ['s1'],
      anonIds: Array.from({ length: 5_001 }, (_, i) => `sim_${i}`),
    }),
    (err: { code?: string }) => err.code === 'too_many_ids',
  );
});

test('cleanupSynthetic with no sessions is a no-op', async () => {
  const res = await cleanupSynthetic(ctx, { eventId: 'cnh-demos', sessionIds: [], anonIds: [] });
  assert.deepEqual(res.removed, { questions: 0, chunks: 0, members: 0, signals: 0, votes: 0 });
});

test('cleanupSynthetic needs Valkey for real work (clear 503)', async () => {
  await assert.rejects(
    cleanupSynthetic(ctx, { eventId: 'cnh-demos', sessionIds: ['s1'], anonIds: ['sim_a1'] }),
    (err: { code?: string }) => err.code === 'valkey_unavailable',
  );
});
