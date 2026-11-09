import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupCaptionLines, speakerLabel } from '../personas/attendee/components/captions';

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
