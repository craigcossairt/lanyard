import { useMemo } from 'react';
import type { Question, QuestionCluster } from '@lanyard/contracts';

interface Props {
  questions: Question[];
  clusters: QuestionCluster[];
  voted: (questionId: string) => boolean;
  mine: (clusterId: string) => boolean;
  onVote: (questionId: string) => void;
}

export interface ClusterView {
  cluster: QuestionCluster;
  representative: Question | undefined;
  votes: number;
  size: number;
  answered: boolean;
}

/** One row per cluster, ranked by votes then size. Hidden questions never render. */
export function buildClusterViews(questions: Question[], clusters: QuestionCluster[]): ClusterView[] {
  const byCluster = new Map<string, Question[]>();
  for (const q of questions) {
    if (q.status === 'hidden') continue;
    const list = byCluster.get(q.clusterId) ?? [];
    list.push(q);
    byCluster.set(q.clusterId, list);
  }
  const seen = new Set<string>();
  const views: ClusterView[] = [];
  for (const c of clusters) {
    const qs = byCluster.get(c.id) ?? [];
    seen.add(c.id);
    const rep = qs.find((q) => q.id === c.representativeQuestionId) ?? qs[0];
    if (!rep && qs.length === 0 && !c.label) continue;
    const votes = Math.max(c.votes, qs.reduce((n, q) => n + q.votes, 0));
    views.push({
      cluster: c,
      representative: rep,
      votes,
      size: Math.max(c.size, qs.length),
      answered: qs.length > 0 && qs.every((q) => q.status === 'answered'),
    });
  }
  // Questions whose cluster hasn't arrived yet still show, one row each.
  for (const [clusterId, qs] of byCluster) {
    if (seen.has(clusterId)) continue;
    const rep = qs[0]!;
    views.push({
      cluster: { id: clusterId, sessionId: rep.sessionId, label: '', size: qs.length, votes: 0, representativeQuestionId: rep.id },
      representative: rep,
      votes: qs.reduce((n, q) => n + q.votes, 0),
      size: qs.length,
      answered: qs.every((q) => q.status === 'answered'),
    });
  }
  return views.sort((a, b) => b.votes - a.votes || b.size - a.size);
}

export function QuestionList({ questions, clusters, voted, mine, onVote }: Props) {
  const views = useMemo(() => buildClusterViews(questions, clusters), [questions, clusters]);
  if (views.length === 0) {
    return <p className="at-muted">No questions yet. Yours could be first.</p>;
  }
  return (
    <ol className="at-questions" aria-label="Questions, most voted first">
      {views.map((v) => {
        const qid = v.representative?.id ?? v.cluster.representativeQuestionId;
        const text = v.representative?.text || v.cluster.label || 'Question';
        const isMine = mine(v.cluster.id);
        const others = Math.max(0, v.size - 1);
        const hasVoted = voted(qid);
        return (
          <li key={v.cluster.id} className={`at-question${v.answered ? ' at-question--answered' : ''}`}>
            <div className="at-question__body">
              <p className="at-question__text">{text}</p>
              <p className="at-question__meta">
                {v.answered && <span className="at-pill at-pill--ok">✓ Answered</span>}
                {isMine ? (
                  <span>{others > 0 ? `You + ${others} ${others === 1 ? 'other' : 'others'} asked this` : 'You asked this'}</span>
                ) : (
                  v.size > 1 && <span>{v.size} people asked this</span>
                )}
              </p>
            </div>
            <button
              type="button"
              className="at-vote"
              aria-pressed={hasVoted}
              aria-label={`Upvote, ${v.votes} ${v.votes === 1 ? 'vote' : 'votes'}`}
              disabled={hasVoted || !qid}
              onClick={() => onVote(qid)}
            >
              <span aria-hidden="true">▲</span>
              <span className="at-vote__count">{v.votes}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
