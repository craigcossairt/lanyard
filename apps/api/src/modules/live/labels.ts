// LLM cluster labels via WS1's worker job `cluster-label` ({questions} -> {label}).
// Runs in the background, never inside an attendee request. Bounded: a cluster is relabeled
// only when it grows to 2, 4, 8 or 16 questions, one relabel per cluster at a time (Valkey
// lock). The label is stored with `labelFrom: 'llm'` and the ids it was built from
// (`labelIds`), so hiding one of them can replace it.
import { channels, realtime } from '@lanyard/contracts';
import { getBus } from '../../core/context';
import { runJob } from '../../core/jobs';
import { logger } from '../../core/logger';
import { keys, kv, readQuestions, toCluster } from './store';

const RELABEL_AT = new Set([2, 4, 8, 16]);
const LOCK_MS = 30_000;
const MAX_QUESTIONS = 20;

/** Provisional label until the LLM's lands: one question's text, trimmed. */
export const provisionalLabel = (text: string) =>
  text.length > 80 ? `${text.slice(0, 77)}…` : text;

/** Fire and forget: relabel the cluster if its size just hit a relabel point. */
export function maybeRelabel(clusterId: string, size: number, force = false): void {
  if (!force && !RELABEL_AT.has(size)) return;
  void relabel(clusterId).catch((err: unknown) =>
    logger.warn({ code: (err as { code?: string }).code }, 'cluster label failed'),
  );
}

async function relabel(clusterId: string): Promise<void> {
  const r = kv();
  const lock = `${keys.cluster(clusterId)}:labeling`;
  if (!(await r.set(lock, '1', 'PX', LOCK_MS, 'NX'))) return;
  try {
    const c = toCluster(await r.hgetall(keys.cluster(clusterId)));
    if (!c) return;
    const members = (await readQuestions(r, c.sessionId))
      .filter((q) => q.clusterId === c.id)
      .sort((a, b) => b.votes - a.votes)
      .slice(0, MAX_QUESTIONS);
    if (members.length === 0) return;
    const res = await runJob<{ label: string }>(
      'cluster-label',
      { questions: members.map((q) => q.text) },
      { timeoutMs: 25_000 },
    );
    const label = res?.label?.trim();
    if (!label) return;
    // Re-check: a member hidden meanwhile must not keep naming the cluster.
    const fresh = toCluster(await r.hgetall(keys.cluster(clusterId)));
    if (!fresh) return;
    const live = new Set(
      (await readQuestions(r, c.sessionId)).filter((q) => q.clusterId === c.id).map((q) => q.id),
    );
    if (!members.every((q) => live.has(q.id))) return;
    await r.hset(keys.cluster(clusterId), {
      label,
      labelFrom: 'llm',
      labelIds: members.map((q) => q.id).join(','),
    });
    await getBus().publish(
      channels.session(fresh.sessionId),
      realtime('cluster.updated', {
        clusterId: fresh.id,
        label,
        size: fresh.size,
        votes: fresh.votes,
      }),
    );
  } finally {
    await r.del(lock).catch(() => undefined);
  }
}
