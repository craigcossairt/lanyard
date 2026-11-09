import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelCluster } from './index';

test('cluster label smoke validates input/model output and coalesces requests', async () => {
  let calls = 0;
  const generate: Parameters<typeof labelCluster>[1] = async (request) => {
    calls++;
    assert.equal(request.model, 'fast');
    assert.equal(request.timeoutMs, 20_000);
    return {
      text: '{"label":"Kernel runtime safety"}',
      model: 'fixture',
      inputTokens: 1,
      outputTokens: 1,
    };
  };
  const input = {
    questions: [
      'How do kernel probes identify a suspicious process?',
      'How do kernel hooks detect a malicious process?',
    ],
  };
  assert.deepEqual(await labelCluster(input, generate), { label: 'Kernel runtime safety' });
  assert.deepEqual(await labelCluster(input, generate), { label: 'Kernel runtime safety' });
  assert.equal(calls, 1);
  await assert.rejects(labelCluster({ questions: [] }, generate), /Too small/);
  await assert.rejects(
    labelCluster({ questions: ['Different fixture'] }, async () => ({
      text: '{"label":""}',
      model: 'fixture',
      inputTokens: 1,
      outputTokens: 1,
    })),
    /invalid cluster label/,
  );
});
