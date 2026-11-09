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

/**
 * Install the label only if every member it was built from is still open and still in
 * this cluster, in one step, so a racing hide can never leave hidden text naming it.
 * KEYS[1] = cluster hash, KEYS[2..] = member question hashes.
 * ARGV: label, labelIds csv, clusterId. Returns 1 if installed.
 */
const INSTALL = `for i = 2, #KEYS do
  local st = redis.call('HGET', KEYS[i], 'status')
  if st == false or st == 'hidden' or redis.call('HGET', KEYS[i], 'clusterId') ~= ARGV[3] then
    return 0
  end
end
redis.call('HSET', KEYS[1], 'label', ARGV[1], 'labelFrom', 'llm', 'labelIds', ARGV[2])
return 1`;

const lockKey = (cid: string) => `${keys.cluster(cid)}:labeling`;
const pendingKey = (cid: string) => `${keys.cluster(cid)}:relabel_pending`;

async function relabel(clusterId: string, rounds = 0): Promise<void> {
  const r = kv();
  if (!(await r.set(lockKey(clusterId), '1', 'PX', LOCK_MS, 'NX'))) {
    // Someone is labeling: ask them to run once more when they finish.
    await r.set(pendingKey(clusterId), '1', 'PX', LOCK_MS * 2);
    return;
  }
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
    const installed = await r.eval(
      INSTALL,
      1 + members.length,
      keys.cluster(clusterId),
      ...members.map((q) => keys.question(q.id)),
      label,
      members.map((q) => q.id).join(','),
      clusterId,
    );
    if (!installed) {
      // A member was hidden or moved meanwhile: label again from the current members.
      await r.set(pendingKey(clusterId), '1', 'PX', LOCK_MS * 2);
      return;
    }
    const fresh = toCluster(await r.hgetall(keys.cluster(clusterId)));
    if (!fresh) return;
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
    await r.del(lockKey(clusterId)).catch(() => undefined);
    // Bounded rerun if a relabel was requested while we held the lock.
    if (rounds < 2 && (await r.getdel(pendingKey(clusterId)).catch(() => null)))
      await relabel(clusterId, rounds + 1);
  }
}
