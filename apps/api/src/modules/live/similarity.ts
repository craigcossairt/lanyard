// Adapter for WS1's duplicate helper (apps/api/src/modules/search/helpers.ts, PR #18).
// Until #18 merges this is a stub with the same signature: every question opens its own
// cluster. Swap: `export { findQuestionCluster } from '../search/helpers';`
export async function findQuestionCluster(_input: {
  eventId: string;
  sessionId: string;
  questionId: string;
  text: string;
}): Promise<{ clusterId: string | null; score: number }> {
  return { clusterId: null, score: 0 };
}
