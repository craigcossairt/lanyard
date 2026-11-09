import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateConferenceAnswer, NO_ANSWER, type ConferenceEvidence } from './ask';
import type { Generate } from './runtime';

test('conference answer smoke accepts exact citations and rejects invented/cross-event sources', async () => {
  const evidence: ConferenceEvidence[] = [
    {
      id: 'chunk',
      kind: 'chunk',
      sessionId: 'session',
      eventId: 'event',
      text: 'Kernel probes capture runtime events.',
    },
  ];
  const generate: Generate = async (input) => {
    assert.equal(input.model, 'chat');
    assert.equal(input.timeoutMs, 20000);
    return {
      text: '{"answer":"Runtime events are captured.","citations":[{"sessionId":"session","chunkId":"chunk"}]}',
      model: 'fixture',
      inputTokens: 1,
      outputTokens: 1,
    };
  };
  assert.equal(
    (await generateConferenceAnswer('event', 'What is captured?', evidence, generate)).citations[0]
      ?.chunkId,
    'chunk',
  );
  await assert.rejects(
    generateConferenceAnswer('other-event', 'What is captured?', evidence, generate),
    /outside/,
  );
  await assert.rejects(
    generateConferenceAnswer(
      'event',
      'What is captured?',
      [{ ...evidence[0]!, id: 'other' }],
      generate,
    ),
    /outside/,
  );
  assert.deepEqual(
    await generateConferenceAnswer('event', 'What is captured?', [], async () => {
      throw new Error('must not call LLM');
    }),
    { answer: NO_ANSWER, citations: [] },
  );
});
