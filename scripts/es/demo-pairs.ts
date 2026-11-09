import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { mock } from 'node:test';
import { es, initEs } from '../../apps/api/src/core/es';
import { request } from './client.mjs';
import { findQuestionCluster, QUESTION_CLUSTER_THRESHOLD } from '../../apps/api/src/modules/search/helpers';
import { demoActions } from '../../apps/worker/src/jobs/sim/demo';

let phase = 'configure';
async function main() {
  const client = initEs(process.env.ES_URL, process.env.ES_API_KEY)!;
  let actualSearchTimeout = 0;
  // Venue transport workaround for this CLI only: real ES responses via fetch,
  // retaining the production helper's exact query, timeout, span and threshold.
  const transport = mock.method(client, 'search', async (params, opts) => {
    const { index, ...body } = params;
    actualSearchTimeout = process.argv.includes('--diagnostic-timeout') ? 15_000 : Number(opts.requestTimeout);
    return request(`/${index}/_search`, { method: 'POST', body, timeoutMs: actualSearchTimeout }).catch(error => {
      console.log(JSON.stringify({ phase, transportError: error.name, status: /HTTP (\d+)/.exec(error.message)?.[1] }));
      throw error;
    });
  });
  const run = `ws1-probe-${randomUUID()}`;
  const proposed = process.argv.includes('--proposed');
  const output = new URL(`../../data/seed/demo-question-calibration-${proposed ? 'proposed' : 'original'}.json`, import.meta.url);
  const groups: string[][] = proposed
    ? (JSON.parse(await readFile(new URL('../../data/seed/demo-question-groups.json', import.meta.url), 'utf8')) as string[][]).map(group => group.map(text => `SIMULATED: ${text}`))
    : Array.from({ length: 4 }, (_, group) => demoActions()
    .filter(action => action.kind === 'question' && action.id.startsWith(`question-${group}-`))
    .map(action => 'text' in action ? action.text : ''));
  const pairs = groups.flatMap((group, g) => group.flatMap((text, i) => group.slice(i + 1).map((query, offset) => ({ id: `${run}-${g}-${i}-${i + offset + 1}`, group: g, original: i, paraphrase: i + offset + 1, text, query })))).filter(pair => !process.argv.includes('--anchors-only') || pair.original === 0);
  try {
    const rows: { group: number; original: number; paraphrase: number; score: number; merged: boolean }[] = process.argv.includes('--resume') ? JSON.parse(await readFile(output, 'utf8')).rows : [];
    for (const pair of pairs) {
      if (rows.some(row => row.group === pair.group && row.original === pair.original && row.paraphrase === pair.paraphrase)) continue;
      phase = 'index';
      await es('cnh-questions', 'diagnostic-index', () => request(`/cnh-questions/_doc/${pair.id}?refresh=wait_for`, { method: 'PUT', timeoutMs: 15_000, body: {
        id: pair.id, eventId: run, sessionId: pair.id, clusterId: pair.id, text: pair.text, status: 'open', votes: 0, anonId: run, at: new Date().toISOString(),
      } }), 15_000);
      phase = 'score';
      const result = await findQuestionCluster({ eventId: run, sessionId: pair.id, questionId: `${pair.id}-new`, text: pair.query });
      const row = { group: pair.group, original: pair.original, paraphrase: pair.paraphrase, score: result.score, merged: result.clusterId === pair.id };
      rows.push(row);
      console.log(JSON.stringify(row));
      await writeFile(output, JSON.stringify({ measuredAt: new Date().toISOString(), threshold: QUESTION_CLUSTER_THRESHOLD, diagnosticTimeoutMs: actualSearchTimeout, rows }, null, 2) + '\n');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    phase = 'write';
  } finally {
    transport.mock.restore();
    await es('cnh-questions', 'diagnostic-cleanup', () => request('/_bulk?refresh=wait_for', { method: 'POST', ndjson: true, body: pairs.map(pair => JSON.stringify({ delete: { _index: 'cnh-questions', _id: pair.id } })).join('\n') + '\n', timeoutMs: 30_000 }), 30_000);
  }
}
main().catch(error => { console.error(JSON.stringify({ probe: 'failed', phase, name: error.name, code: error.code, status: /HTTP (\d+)/.exec(error.message)?.[1] })); process.exitCode = 1; });
