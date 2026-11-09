import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../../core/config';
import { buildServer } from '../../core/server';
import { signToken } from '../../core/tokens';
import live from './index';

const KEY = 'test-signing-key-not-a-secret';

test('live routes: auth, roles and validation (ES and Valkey unconfigured)', async () => {
  const app = await buildServer(
    {
      ...loadConfig(),
      tokenSigningKey: KEY,
      esUrl: undefined,
      valkeyUrl: undefined,
      webDistDir: '/nonexistent',
    },
    [live],
  );
  const tok = (role: 'attendee' | 'speaker') =>
    `Bearer ${signToken(KEY, { sub: 'a1', role, eventId: 'cnh-demos' }, 60).token}`;

  // No token: 401 on every route.
  for (const [method, url] of [
    ['GET', '/api/sessions/s1/stream'],
    ['POST', '/api/sessions/s1/transcript'],
    ['POST', '/api/sessions/s1/presence'],
    ['POST', '/api/sessions/s1/questions'],
    ['POST', '/api/questions/q1/vote'],
    ['PATCH', '/api/questions/q1'],
    ['POST', '/api/sessions/s1/signals'],
    ['POST', '/api/sessions/s1/catch-up'],
  ] as const) {
    assert.equal((await app.inject({ method, url })).statusCode, 401, url);
  }

  // Attendees cannot append captions.
  const cap = await app.inject({
    method: 'POST',
    url: '/api/sessions/s1/transcript',
    headers: { authorization: tok('attendee') },
    payload: { text: 'hi' },
  });
  assert.equal(cap.statusCode, 403);

  // Only speakers (or organizers) answer or hide questions.
  const patch = await app.inject({
    method: 'PATCH',
    url: '/api/questions/q1',
    headers: { authorization: tok('attendee') },
    payload: { status: 'hidden' },
  });
  assert.equal(patch.statusCode, 403);

  // Empty question text is rejected.
  const empty = await app.inject({
    method: 'POST',
    url: '/api/sessions/s1/questions',
    headers: { authorization: tok('attendee') },
    payload: { text: '' },
  });
  assert.equal(empty.statusCode, 400);

  // Unknown signal type is rejected.
  const sig = await app.inject({
    method: 'POST',
    url: '/api/sessions/s1/signals',
    headers: { authorization: tok('attendee') },
    payload: { type: 'too_loud_and_wrong' },
  });
  assert.equal(sig.statusCode, 400);

  // Bad body: 400 before any backend call.
  const bad = await app.inject({
    method: 'POST',
    url: '/api/sessions/s1/presence',
    headers: { authorization: tok('attendee') },
    payload: { kind: 'teleport' },
  });
  assert.equal(bad.statusCode, 400);

  // Backends down: a clear 503, not a hang.
  const down = await app.inject({
    method: 'GET',
    url: '/api/sessions/s1/stream',
    headers: { authorization: tok('attendee') },
  });
  assert.equal(down.statusCode, 503);
  await app.close();
});
