#!/usr/bin/env node
// How long does one session stream stay open through TARGET, and how does it end?
// Joins once, opens GET /api/sessions/:id/stream with the token in the
// Authorization header, and reports open time, SSE events and heartbeats.
// Bounded to MAX_S (default 70 s). Prints no token.
//   TARGET=https://lanyard.cnh.radarhq.io node scripts/load/stream-lifetime.mjs
//   TARGET=http://127.0.0.1:18090 node scripts/load/stream-lifetime.mjs   # kubectl port-forward svc/app 18090:80
const target = (process.env.TARGET || 'https://lanyard.cnh.radarhq.io').replace(/\/$/, '');
const eventId = process.env.EVENT_ID || 'kubecon-na-2026';
const joinCode = process.env.JOIN_CODE || 'KUBECON26';
const sessionId = process.env.SESSION_ID || 'kubecon-session-1289969';
const maxS = Math.min(Number(process.env.MAX_S) || 70, 300);

const joined = await fetch(`${target}/api/events/${encodeURIComponent(eventId)}/join`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ joinCode }),
  signal: AbortSignal.timeout(10_000),
}).then((r) => r.json());
if (!joined?.token) { console.log(JSON.stringify({ error: 'join failed' })); process.exit(1); }

const ctrl = new AbortController();
setTimeout(() => ctrl.abort(), maxS * 1000).unref();
const t0 = Date.now();
let events = 0;
let heartbeats = 0;
let status = null;
let end = 'server closed the stream';
try {
  const res = await fetch(`${target}/api/sessions/${encodeURIComponent(sessionId)}/stream`, {
    headers: { accept: 'text/event-stream', authorization: `Bearer ${joined.token}` },
    signal: ctrl.signal,
  });
  status = res.status;
  // Count complete lines only: network chunks don't keep the server's write
  // boundaries, so a field like "event:" can be split across two reads.
  const dec = new TextDecoder();
  let buf = '';
  const countLine = (line) => {
    if (line.startsWith('event:')) events++;
    else if (line.startsWith(': hb')) heartbeats++;
  };
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      countLine(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  }
  countLine(buf);
} catch (e) {
  end = ctrl.signal.aborted ? `still open at ${maxS} s (client stopped)` : `error: ${e.cause?.code ?? e.name}`;
}
console.log(JSON.stringify({ target, status, openForS: Math.round((Date.now() - t0) / 100) / 10, end, events, heartbeats }));
