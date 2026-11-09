import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { es, initEs } from '../../apps/api/src/core/es';
import { HttpError } from '../../apps/api/src/core/errors';
import { completeSearch } from '../../apps/api/src/modules/search/response';

interface Pair {
  id: string;
  original: string;
  query: string;
  duplicate: boolean;
}
let phase = 'read-pairs';
async function calibrate(): Promise<void> {
  const pairs: Pair[] = JSON.parse(
    await readFile(new URL('../../data/seed/question-pairs.json', import.meta.url), 'utf8'),
  );
  phase = 'configure-client';
  initEs(process.env.ES_URL, process.env.ES_API_KEY);
  const index = `cnh-ws1-calibration-${randomUUID()}`;
  const rows: { id: string; duplicate: boolean; score: number }[] = [];
  try {
    phase = 'setup-index';
    await es(
      'multi',
      'calibration-setup',
      (c, o) =>
        c.indices.create(
          {
            index,
            mappings: {
              properties: {
                pairId: { type: 'keyword' },
                text: { type: 'text', copy_to: 'semantic' },
                semantic: { type: 'semantic_text' },
              },
            },
          },
          o,
        ),
      60_000,
    );
    phase = 'index-pairs';
    await es(
      'multi',
      'calibration-index',
      (c, o) =>
        c
          .bulk(
            {
              index,
              operations: pairs.flatMap((pair) => [
                { create: { _id: pair.id } },
                { pairId: pair.id, text: pair.original },
              ]),
            },
            o,
          )
          .then((result) => {
            if (result.errors) throw new Error('Calibration bulk failed');
          }),
      120_000,
    );
    await es('multi', 'calibration-refresh', (c, o) => c.indices.refresh({ index }, o), 60_000);
    phase = 'search-pairs';
    for (const pair of pairs) {
      const result = await es('multi', 'calibration-search', (c, o) =>
        c
          .search(
            {
              index,
              size: 1,
              _source: false,
              query: {
                bool: {
                  filter: { term: { pairId: pair.id } },
                  must: { semantic: { field: 'semantic', query: pair.query } },
                },
              },
            },
            o,
          )
          .then(completeSearch),
      );
      if (result.timed_out || !result.hits.hits.length)
        throw new Error('Calibration search incomplete');
      rows.push({
        id: pair.id,
        duplicate: pair.duplicate,
        score: result.hits.hits[0]?._score ?? 0,
      });
    }
    const scores = rows.map((row) => row.score).sort((a, b) => a - b);
    const thresholds = [0, ...scores.map((score, i) => (score + (scores[i + 1] ?? 1)) / 2), 1];
    const evaluate = (threshold: number) => {
      const falseMerges = rows.filter((row) => !row.duplicate && row.score >= threshold).length;
      const missedDuplicates = rows.filter((row) => row.duplicate && row.score < threshold).length;
      return { threshold, falseMerges, missedDuplicates, loss: falseMerges * 4 + missedDuplicates };
    };
    const best = thresholds
      .map(evaluate)
      .sort(
        (a, b) => a.loss - b.loss || a.falseMerges - b.falseMerges || a.threshold - b.threshold,
      )[0];
    const mapping = await es('multi', 'calibration-mapping', (c, o) =>
      c.indices.getMapping({ index }, o),
    );
    const semantic = mapping[index]?.mappings?.properties?.semantic;
    const inferenceId = semantic && 'inference_id' in semantic ? semantic.inference_id : undefined;
    const evidence = {
      measuredAt: new Date().toISOString(),
      inferenceId,
      pairs: rows,
      selected: best,
    };
    phase = 'write-evidence';
    await writeFile(
      new URL('../../data/seed/question-calibration-results.json', import.meta.url),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log(
      JSON.stringify({ calibration: 'passed', inferenceId, pairs: rows.length, ...best }),
    );
  } finally {
    await es(
      'multi',
      'calibration-cleanup',
      (c, o) => c.indices.delete({ index, ignore_unavailable: true }, o),
      60_000,
    );
  }
}
calibrate().catch((error: unknown) => {
  const code = error instanceof HttpError ? error.code : (error as NodeJS.ErrnoException)?.code;
  console.error(
    JSON.stringify({
      calibration: 'failed',
      phase,
      name: error instanceof Error ? error.name : 'Error',
      code: code && /^[a-zA-Z_]+$/.test(code) ? code : undefined,
      // JSON parse/fs errors can quote input text or paths; never print those messages.
      message:
        error instanceof HttpError
          ? error.message
          : error instanceof SyntaxError
            ? 'Invalid calibration JSON'
            : 'Calibration operation failed',
    }),
  );
  process.exitCode = 1;
});
