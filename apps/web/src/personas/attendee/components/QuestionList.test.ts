import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Question, QuestionCluster } from '@lanyard/contracts';
import { buildClusterViews } from './QuestionList';

const q = (
  id: string,
  clusterId: string,
  votes: number,
  status: Question['status'] = 'open',
): Question => ({
  id,
  sessionId: 's1',
  anonId: 'a',
  text: `text ${id}`,
  clusterId,
  votes,
  status,
  at: '2026-11-09T20:00:00Z',
});

test('clusters rank by votes then size, hidden questions drop out', () => {
  const clusters: QuestionCluster[] = [
    { id: 'c1', sessionId: 's1', label: 'A', size: 2, votes: 1, representativeQuestionId: 'q1' },
    { id: 'c2', sessionId: 's1', label: 'B', size: 5, votes: 9, representativeQuestionId: 'q3' },
  ];
  const views = buildClusterViews(
    [q('q1', 'c1', 1), q('q2', 'c1', 0), q('q3', 'c2', 9), q('q4', 'c3', 0, 'hidden')],
    clusters,
  );
  assert.deepEqual(
    views.map((v) => v.cluster.id),
    ['c2', 'c1'],
  );
  assert.equal(views[0]?.representative?.id, 'q3');
  assert.equal(views[1]?.size, 2);
});

test('a cluster whose only known questions are hidden does not render', () => {
  const clusters: QuestionCluster[] = [
    {
      id: 'c1',
      sessionId: 's1',
      label: 'Moderated',
      size: 1,
      votes: 0,
      representativeQuestionId: 'q1',
    },
    {
      id: 'c2',
      sessionId: 's1',
      label: 'Pending',
      size: 1,
      votes: 0,
      representativeQuestionId: 'q2',
    },
  ];
  const views = buildClusterViews([q('q1', 'c1', 0, 'hidden')], clusters);
  assert.deepEqual(
    views.map((v) => v.cluster.id),
    ['c2'],
  );
});

test('a question with no cluster yet still shows', () => {
  const views = buildClusterViews([q('q9', 'cX', 2)], []);
  assert.equal(views.length, 1);
  assert.equal(views[0]?.votes, 2);
});
