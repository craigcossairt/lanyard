import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setCaptionTranslator } from './locale';
import { groupCaptionLines, presentCaption, speakerLabel } from '../personas/attendee/components/captions';

test('presentCaption keeps the source language until a translator changes the words', () => {
  assert.deepEqual(presentCaption('Hello', 'en', 'es'), { text: 'Hello', lang: 'en' });
  assert.deepEqual(presentCaption('Hello', undefined, 'es'), { text: 'Hello', lang: undefined });
  setCaptionTranslator(({ text, to }) => `${text} [${to}]`);
  assert.deepEqual(presentCaption('Hello', 'en', 'es'), { text: 'Hello [es]', lang: 'es' });
  setCaptionTranslator(null);
});

test('speakerLabel joins the people listed on the session', () => {
  assert.equal(speakerLabel([' Ada ', '']), 'Ada');
  assert.equal(speakerLabel(['Ada', 'Grace']), 'Ada, Grace');
});

test('groupCaptionLines marks a change only when the speaker changes', () => {
  const groups = groupCaptionLines(
    [
      { chunkId: '1', text: 'Hello' },
      { chunkId: '2', text: 'More', speaker: 'Ada' },
      { chunkId: '3', text: 'Still Ada', speaker: 'Ada' },
      { chunkId: '4', text: 'My turn', speaker: 'Grace' },
    ],
    'Ada',
  );
  assert.deepEqual(
    groups.map((group) => [group.speaker, group.lines.map((line) => line.chunkId)]),
    [
      ['Ada', ['1', '2', '3']],
      ['Grace', ['4']],
    ],
  );
});
