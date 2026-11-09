import assert from 'node:assert/strict';
import { test } from 'node:test';
import { channels, realtime } from '@lanyard/contracts';
import { requireAuth } from './auth';
import { loadConfig } from './config';
import { defineModule } from './module';
import { buildServer } from './server';
import { HEARTBEAT_MS, openSse } from './sse';
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
  // Nothing may buffer or compress the stream between us and the client.
  assert.match(res.headers.get('cache-control') ?? '', /no-transform/);
  assert.equal(res.headers.get('x-accel-buffering'), 'no');
  assert.equal(res.headers.get('content-encoding'), null);
  assert.ok(HEARTBEAT_MS <= 5_000, 'heartbeat must beat the ~15 s ingress cut');

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
  await readUntil('"live":true');

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

test('SSE survives a 15 s-style proxy cut: clean rotation + Last-Event-ID replay', async () => {
  const demo = defineModule({
    name: 'demo2',
    register(app) {
      app.get<{ Params: { id: string } }>(
        '/sessions/:id/stream',
        { preHandler: requireAuth() },
        (req, reply) => {
          openSse(req, reply, { channels: [channels.session(req.params.id)], maxStreamMs: 600 });
        },
      );
    },
  });
  const cfg = { ...loadConfig(), tokenSigningKey: KEY, esUrl: undefined, valkeyUrl: undefined };
  const app = await buildServer({ ...cfg, webDistDir: '/nonexistent' }, [demo]);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}/api/sessions/s9/stream`;
  const { token } = signToken(KEY, { sub: 'a9', role: 'attendee', eventId: 'cnh-demos' }, 60);
  const { getBus } = await import('./context');
  const status = (s: 'live' | 'ended') =>
    getBus().publish(
      channels.session('s9'),
      realtime('session.status', { sessionId: 's9', status: s }),
    );

  // Reads the whole response until the server ends it (or the "proxy" aborts it).
  const readAll = async (headers: Record<string, string>, cutAfterMs?: number) => {
    const ac = new AbortController();
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, ...headers },
      signal: ac.signal,
    });
    if (cutAfterMs) setTimeout(() => ac.abort(), cutAfterMs);
    let text = '';
    const dec = new TextDecoder();
    try {
      for await (const chunk of res.body!) text += dec.decode(chunk as Uint8Array);
    } catch {
      /* aborted: simulated proxy cut */
    }
    return text;
  };

  // 1) Server rotates cleanly before the gateway cut: reconnect hint, ids on messages.
  const first = readAll({});
  await new Promise((r) => setTimeout(r, 150));
  await status('live');
  const t1 = await first;
  assert.match(t1, /event: reconnect\ndata: \{"reason":"max-stream"\}\nretry: 0/);
  const lastId = /id: (\d+-\d+)\nevent: session\.status/.exec(t1)?.[1];
  assert.ok(lastId, 'messages carry ids');

  // 2) While disconnected (proxy cut), a message is published; the resume replays it.
  await status('ended');
  const t2 = await readAll({ 'last-event-id': lastId! }, 300);
  assert.match(t2, /"status":"ended"/);
  assert.doesNotMatch(t2, /"status":"live"/, 'no duplicate of what the client already had');
  assert.match(t2, /"resumed":true/);

  // 3) An unknown/expired id falls back to resumed:false (client refetches its snapshot).
  const t3 = await readAll({ 'last-event-id': '1-0' }, 300);
  assert.match(t3, /"resumed":false/);
  await app.close();
});
