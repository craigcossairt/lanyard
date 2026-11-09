import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../../api/src/core/config';
import { initContext } from '../../api/src/core/context';
import { initJobs, runJob } from '../../api/src/core/jobs';
import { jobs } from './jobs';
import { buildWorker } from './server';

test('worker health and job trigger (runJob round-trip)', async () => {
  const ctx = initContext({ ...loadConfig(), esUrl: undefined, valkeyUrl: undefined });
  const app = buildWorker('test', jobs, ctx);
  const r = await app.inject('/readyz');
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().role, 'worker');

  assert.equal(
    (await app.inject({ method: 'POST', url: '/jobs/nope', payload: {} })).statusCode,
    404,
  );

  await app.listen({ port: 0, host: '127.0.0.1' });
  initJobs(`http://127.0.0.1:${(app.server.address() as { port: number }).port}`);
  const out = await runJob<{ pong: boolean; echo: string }>('ping', { echo: 'hi' });
  assert.equal(out?.pong, true);
  assert.equal(out?.echo, 'hi');
  assert.equal(await runJob('ping', {}, { wait: false }), undefined);
  await app.close();
});
