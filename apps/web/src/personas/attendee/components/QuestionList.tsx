// Pure ranking for question clusters, shared by the attendee live view and the speaker console.
// Rendering lives in the design system's QuestionItem.
import type { Question, QuestionCluster } from '@lanyard/contracts';

export interface ClusterView {
  cluster: QuestionCluster;
  representative: Question | undefined;
  votes: number;
  size: number;
  answered: boolean;
}

/** One row per cluster, ranked by votes then size. Hidden questions never render. */
export function buildClusterViews(
  questions: Question[],
  clusters: QuestionCluster[],
): ClusterView[] {
  const byCluster = new Map<string, Question[]>();
  // Clusters whose questions we know about but which are all hidden must not render,
  // even via the cluster label; clusters whose questions haven't arrived yet still may.
  const allHidden = new Set<string>();
  for (const q of questions) {
    if (q.status === 'hidden') {
      if (!byCluster.has(q.clusterId)) allHidden.add(q.clusterId);
      continue;
    }
    allHidden.delete(q.clusterId);
    const list = byCluster.get(q.clusterId) ?? [];
    list.push(q);
    byCluster.set(q.clusterId, list);
  }
  const seen = new Set<string>();
  const views: ClusterView[] = [];
  for (const c of clusters) {
    const qs = byCluster.get(c.id) ?? [];
    seen.add(c.id);
    if (allHidden.has(c.id)) continue;
    const rep = qs.find((q) => q.id === c.representativeQuestionId) ?? qs[0];
    if (!rep && qs.length === 0 && !c.label) continue;
    const votes = Math.max(
      c.votes,
      qs.reduce((n, q) => n + q.votes, 0),
    );
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
      cluster: {
        id: clusterId,
        sessionId: rep.sessionId,
        label: '',
        size: qs.length,
        votes: 0,
        representativeQuestionId: rep.id,
      },
      representative: rep,
      votes: qs.reduce((n, q) => n + q.votes, 0),
      size: qs.length,
      answered: qs.every((q) => q.status === 'answered'),
    });
  }
  return views.sort((a, b) => b.votes - a.votes || b.size - a.size);
}
