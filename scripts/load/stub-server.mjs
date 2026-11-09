#!/usr/bin/env node
// Test fixture only: a tiny in-memory stand-in for the contract routes that
// attendees.mjs calls, so the generator can be checked before WS2's routes
// exist. Not the app, never deployed. Usage: node scripts/load/stub-server.mjs
// (listens on PORT or 8099), then TARGET=http://localhost:8099 node attendees.mjs
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 8099);
const streams = new Map(); // sessionId -> Set<res>
const questions = new Map(); // id -> { sessionId, votes }

const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const fanout = (sessionId, msg) => {
  const line = `data: ${JSON.stringify({ ...msg, at: new Date().toISOString() })}\n\n`;
  for (const res of streams.get(sessionId) ?? []) res.write(line);
};
const readJson = (req) =>
  new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://stub');
  const p = url.pathname.split('/').filter(Boolean); // ['api', ...]
  if (req.method === 'POST' && p[1] === 'events' && p[3] === 'join') {
    const anonId = randomUUID();
    return send(res, 200, { anonId, handle: 'Teal Otter', token: `stub.${anonId}` });
  }
  if (req.method === 'GET' && p[1] === 'sessions' && p[3] === 'stream') {
    // STUB_STREAM_STATUS=401 (say) makes every stream fail, to test reconnects.
    if (process.env.STUB_STREAM_STATUS) {
      return send(res, Number(process.env.STUB_STREAM_STATUS), { error: { code: 'stub', message: 'stream refused' } });
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    res.write(': connected\n\n');
    const set = streams.get(p[2]) ?? streams.set(p[2], new Set()).get(p[2]);
    set.add(res);
    req.on('close', () => set.delete(res));
    return;
  }
  if (req.method === 'POST' && p[1] === 'sessions' && p[3] === 'questions') {
    await readJson(req);
    const id = randomUUID();
    questions.set(id, { sessionId: p[2], votes: 0 });
    // Fan out after a small delay, like a real pub/sub hop.
    setTimeout(() => fanout(p[2], { type: 'question.created', payload: { questionId: id, votes: 0 } }), 20);
    return send(res, 201, { id, clusterId: id });
  }
  if (req.method === 'POST' && p[1] === 'questions' && p[3] === 'vote') {
    const q = questions.get(p[2]);
    if (!q) return send(res, 404, { error: { code: 'not_found', message: 'no such question' } });
    q.votes++;
    fanout(q.sessionId, { type: 'question.updated', payload: { questionId: p[2], votes: q.votes } });
    return send(res, 200, { votes: q.votes });
  }
  if (req.method === 'POST' && p[1] === 'sessions' && (p[3] === 'presence' || p[3] === 'signals')) {
    await readJson(req);
    return send(res, 202, {});
  }
  send(res, 404, { message: 'Route not found' });
}).listen(port, () => console.log(`stub listening on :${port}`));
