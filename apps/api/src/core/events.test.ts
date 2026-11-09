import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from './config';
import { buildServer } from './server';
import { signToken, verifyToken } from './tokens';

const KEY = 'test-signing-key-not-a-secret';

test('tokens round-trip and reject tampering', () => {
  const { token } = signToken(KEY, { sub: 'a1', role: 'attendee', eventId: 'cnh-demos' }, 60);
  assert.equal(verifyToken(KEY, token).sub, 'a1');
  assert.throws(() => verifyToken('other-key', token));
});

test('join, config and role-links (ES unconfigured)', async () => {
  const app = await buildServer(
    {
      ...loadConfig(),
      tokenSigningKey: KEY,
      esUrl: undefined,
      valkeyUrl: undefined,
      webDistDir: '/nonexistent',
    },
    [],
  );

  // Known event still joinable when ES is down/unconfigured.
  const join = await app.inject({ method: 'POST', url: '/api/events/cnh-demos/join', payload: {} });
  assert.equal(join.statusCode, 201);
  const body = join.json();
  assert.equal(body.role, 'attendee');
  assert.equal(verifyToken(KEY, body.token).sub, body.anonId);

  // GET event without ES: clear 503, pod stays ready.
  const ev = await app.inject('/api/events/cnh-demos');
  assert.equal(ev.statusCode, 503);
  assert.equal(ev.json().error.code, 'es_unavailable');
  assert.equal((await app.inject('/readyz')).statusCode, 200);

  assert.equal((await app.inject('/api/config')).json().eventTz, 'America/Denver');

  // Attendees cannot mint role links; organizers get fragment links.
  const denied = await app.inject({
    method: 'POST',
    url: '/api/events/cnh-demos/role-links',
    headers: { authorization: `Bearer ${body.token}` },
    payload: { role: 'speaker' },
  });
  assert.equal(denied.statusCode, 403);
  const org = signToken(KEY, { sub: 'o1', role: 'organizer', eventId: 'cnh-demos' }, 60).token;
  const links = await app.inject({
    method: 'POST',
    url: '/api/events/cnh-demos/role-links',
    headers: { authorization: `Bearer ${org}` },
    payload: { role: 'speaker', count: 2 },
  });
  assert.equal(links.statusCode, 200);
  assert.equal(links.json().links.length, 2);
  assert.match(links.json().links[0].url, /\/join#t=/);
  await app.close();
});
