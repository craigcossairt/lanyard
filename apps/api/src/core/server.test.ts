import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig } from './config';
import { redactUrl } from './redact';
import { buildServer } from './server';

test('health, SPA fallback and JSON 404', async () => {
  const dist = mkdtempSync(path.join(tmpdir(), 'lanyard-web-'));
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Lanyard</title>');
  const app = await buildServer({ ...loadConfig(), webDistDir: dist });

  assert.equal((await app.inject('/healthz')).statusCode, 200);
  assert.equal((await app.inject('/readyz')).statusCode, 200);

  const spa = await app.inject('/a/schedule');
  assert.equal(spa.statusCode, 200);
  assert.match(spa.body, /Lanyard/);

  const miss = await app.inject('/api/nope?token=abc');
  assert.equal(miss.statusCode, 404);
  assert.equal(miss.json().error.code, 'not_found');
  assert.doesNotMatch(miss.body, /abc/);

  assert.equal((await app.inject('/missing.js')).statusCode, 404);
  await app.close();
});

test('redactUrl strips token-like query params', () => {
  assert.equal(redactUrl('/x?token=abc&p=1'), '/x?token=[REDACTED]&p=1');
  assert.equal(redactUrl('/x?p=1&t=abc'), '/x?p=1&t=[REDACTED]');
  assert.equal(redactUrl('/x?%74oken=abc'), '/x?%74oken=[REDACTED]');
  assert.equal(
    redactUrl('/api/events/e/search?q=my+private+text'),
    '/api/events/e/search?q=[REDACTED]',
  );
});
