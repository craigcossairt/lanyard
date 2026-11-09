import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeClaims } from './auth';
import { parseSse } from './sse';

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
