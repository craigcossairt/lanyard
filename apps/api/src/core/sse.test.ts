import assert from 'node:assert/strict';
import { test } from 'node:test';
import { channels, realtime } from '@lanyard/contracts';
import { requireAuth } from './auth';
import { loadConfig } from './config';
import { defineModule } from './module';
import { buildServer } from './server';
import { openSse } from './sse';
import { signToken } from './tokens';

const KEY = 'test-signing-key-not-a-secret';

test('SSE stream: bearer auth, session + user channel multiplexed', async () => {
  const demo = defineModule({
    name: 'demo',
    register(app) {
      app.get<{ Params: { id: string } }>(
        '/sessions/:id/stream',
        { preHandler: requireAuth() },
        (req, reply) => {
          openSse(req, reply, { channels: [channels.session(req.params.id)] });
        },
      );
    },
  });
  const cfg = { ...loadConfig(), tokenSigningKey: KEY, esUrl: undefined, valkeyUrl: undefined };
  const app = await buildServer({ ...cfg, webDistDir: '/nonexistent' }, [demo]);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  const { token } = signToken(KEY, { sub: 'a1', role: 'attendee', eventId: 'cnh-demos' }, 60);

  const unauth = await fetch(`http://127.0.0.1:${port}/api/sessions/s1/stream`);
  assert.equal(unauth.status, 401);

  const ac = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}/api/sessions/s1/stream`, {
    headers: { authorization: `Bearer ${token}` },
    signal: ac.signal,
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);

  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const readUntil = async (needle: string) => {
    while (!buf.includes(needle)) {
      const { value, done } = await reader.read();
      if (done) throw new Error('stream ended');
      buf += dec.decode(value);
    }
  };
  await readUntil('event: ready');

  const { getBus } = await import('./context');
  await getBus().publish(
    channels.session('s1'),
    realtime('session.status', { sessionId: 's1', status: 'live' }),
  );
  await getBus().publish(
    channels.user('a1'),
    realtime('reroute.suggested', { anonId: 'a1', sessionId: 's2', reason: 'Room is full' }),
  );
  await readUntil('event: session.status');
  await readUntil('event: reroute.suggested');

  ac.abort();
  await app.close();
});
