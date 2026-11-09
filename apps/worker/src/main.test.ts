import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWorker } from './server';

test('worker health routes', async () => {
  const app = buildWorker('test');
  const r = await app.inject('/readyz');
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().role, 'worker');
  assert.equal((await app.inject('/healthz')).statusCode, 200);
  await app.close();
});
