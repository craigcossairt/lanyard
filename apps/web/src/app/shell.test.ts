import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from './api';
import { decodeClaims } from './auth';
import { parseSse, reconnectDelay } from './sse';

test('parseSse handles heartbeats, multi-line data and partial frames', () => {
  const seen: [string, string][] = [];
  const rest = parseSse(
    ': hb 1\n\nretry: 2000\n\nevent: ready\ndata: {"retryMs":2000}\n\nevent: session.status\ndata: {"a":\ndata: 1}\n\nevent: part',
    (e, d) => seen.push([e, d]),
  );
  assert.deepEqual(seen, [
    ['ready', '{"retryMs":2000}'],
    ['session.status', '{"a":\n1}'],
  ]);
  assert.equal(rest, 'event: part');
});

test('decodeClaims reads unexpired claims and rejects junk', () => {
  const claims = {
    sub: 'a1',
    role: 'attendee',
    eventId: 'cnh-demos',
    iat: 1,
    exp: Date.now() / 1000 + 60,
  };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  assert.equal(decodeClaims(`${body}.sig`)?.sub, 'a1');
  assert.equal(decodeClaims('nope'), undefined);
});

test('parseSse surfaces ids; first reconnect is immediate, then backoff', () => {
  const seen: [string, string | undefined][] = [];
  parseSse(
    'id: 17-0\nevent: caption.appended\ndata: {}\n\nevent: reconnect\ndata: {}\nretry: 0\n\n',
    (e, _d, id) => seen.push([e, id]),
  );
  assert.deepEqual(seen, [
    ['caption.appended', '17-0'],
    ['reconnect', undefined],
  ]);
  assert.equal(reconnectDelay(0, 2000), 0);
  assert.ok(reconnectDelay(1, 2000) >= 1500);
});

test('ApiError shows a friendly sentence and keeps the server text as detail', () => {
  const e = new ApiError(503, 'worker_unavailable', 'WORKER_URL is not set');
  assert.equal(e.message, 'That isn’t available right now. Try again in a moment.');
  assert.equal(e.detail, 'WORKER_URL is not set');
  assert.equal(e.code, 'worker_unavailable');
  assert.match(new ApiError(403, 'bad_join_code', 'x').message, /join code/);
});
