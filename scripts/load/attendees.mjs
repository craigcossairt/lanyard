#!/usr/bin/env node
// Lanyard load generator: N virtual attendees join a session, hold its SSE
// stream open, and ask, vote and signal at a bounded rate (docs/plan/06-demo.md,
// incident A). No dependencies (Node >= 22). Never logs tokens or question text.
//
// Hard bounds, whatever the env says: 300 attendees, 600 s, 100 actions/s,
// and the process exits DURATION_S + 30 s after start no matter what.
//
// Routes (docs/plan/02-contracts.md §4). A route that answers 404 without a
// contract error body ({error:{code}}) counts as "not built yet" and is skipped
// for the rest of the run, so this works against a partial v1.

import { monitorEventLoopDelay } from 'node:perf_hooks';

// If the generator itself is starved (event-loop lag p99 over ~100 ms), its
// latency numbers include its own delay: lower ATTENDEES or raise the CPU limit.
const loopLag = monitorEventLoopDelay({ resolution: 20 });
loopLag.enable();

const env = process.env;
const num = (k, d) => {
  const v = Number(env[k]);
  return env[k] === undefined || env[k] === '' || !Number.isFinite(v) ? d : v;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const cfg = {
  target: (env.TARGET || 'http://app').replace(/\/$/, ''),
  eventId: env.EVENT_ID || 'kubecon-na-2026',
  joinCode: env.JOIN_CODE || 'KUBECON26',
  sessionId: env.SESSION_ID || 'kubecon-session-1289969',
  attendees: clamp(num('ATTENDEES', 50), 1, 300),
  durationS: clamp(num('DURATION_S', 120), 10, 600),
  rampS: clamp(num('RAMP_S', 30), 0, 120),
  maxRps: clamp(num('MAX_RPS', 40), 1, 100),
  thinkS: clamp(num('THINK_S', 8), 1, 120),
  reqTimeoutMs: clamp(num('REQ_TIMEOUT_MS', 5000), 500, 20000),
};

const SIGNALS = ['slower', 'louder', 'cant_see', 'lost', 'thumbs_up', 'too_cold', 'too_hot'];
const QUESTIONS = [
  'How does this work with multiple clusters?',
  'Does this approach scale to thousands of nodes?',
  'What is the upgrade path from the previous version?',
  'How do you handle multi-tenancy here?',
  'Is there a way to run this without cluster-admin?',
  'What does observability look like for this?',
  'How does this compare with doing it in a service mesh?',
  'Can you share the slides and the repo?',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const enc = encodeURIComponent;
const t0Run = Date.now();
const until = t0Run + cfg.durationS * 1000;
let stopping = false;

// ---- stats ---------------------------------------------------------------
const MAX_SAMPLES = 50_000;
const stats = {
  routes: {},
  unimplemented: new Set(),
  joined: 0,
  joinFailed: 0,
  sse: { open: 0, opened: 0, reconnects: 0, errors: 0, messages: 0 },
  fanoutMs: [],
};
const push = (arr, v) => { if (arr.length < MAX_SAMPLES) arr.push(v); };
function record(route, status, ms) {
  const r = (stats.routes[route] ??= { n: 0, codes: {}, ms: [] });
  r.n++;
  r.codes[status] = (r.codes[status] || 0) + 1;
  push(r.ms, ms);
}
function pct(a, p) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
}

// ---- rate limit: one shared token bucket for every action ---------------
let tokens = cfg.maxRps;
setInterval(() => { tokens = cfg.maxRps; }, 1000).unref();
async function takeToken() {
  while (tokens <= 0) await sleep(25 + Math.random() * 50);
  tokens--;
}

// ---- HTTP ----------------------------------------------------------------
// `meta.sentAt` is set when the request actually leaves (after the rate
// limiter), so latency numbers never include the generator's own queueing.
async function call(route, method, path, { token, body, force = false, meta } = {}) {
  if (stats.unimplemented.has(route) || (stopping && !force)) return null;
  await takeToken();
  if (meta) meta.sentAt = Date.now();
  const t = performance.now();
  let status = 'ERR';
  try {
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    if (method !== 'GET') headers['content-type'] = 'application/json';
    const res = await fetch(cfg.target + path, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(cfg.reqTimeoutMs),
    });
    status = res.status;
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    if (res.status === 404 && !json?.error?.code) stats.unimplemented.add(route);
    return res.ok ? json ?? {} : null;
  } catch (e) {
    status = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'ERR';
    return null;
  } finally {
    record(route, status, performance.now() - t);
  }
}

// ---- fanout latency: ask time -> question.created seen on each stream ----
const askedAt = new Map(); // questionId -> ms epoch the ask request started
const early = new Map(); // questionId -> receipt times seen before the ask returned
const knownQuestions = [];
function onQuestionSeen(id, at) {
  if (!id) return;
  const t = askedAt.get(id);
  if (t !== undefined) push(stats.fanoutMs, at - t);
  else if (early.size < 5000) (early.get(id) ?? early.set(id, []).get(id)).push(at);
}
function onAsked(id, startedAt) {
  if (!id) return;
  askedAt.set(id, startedAt);
  for (const at of early.get(id) ?? []) push(stats.fanoutMs, at - startedAt);
  early.delete(id);
  knownQuestions.push(id);
  if (knownQuestions.length > 200) knownQuestions.shift();
}
function onSseEvent(raw) {
  stats.sse.messages++;
  let type = null;
  let data = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  let msg = null;
  try { msg = JSON.parse(data); } catch { return; }
  type = msg?.type ?? type;
  if (type === 'question.created') {
    const p = msg.payload ?? msg;
    onQuestionSeen(p.questionId ?? p.id ?? p.question?.id, Date.now());
  }
}

// ---- one SSE stream per attendee, reconnecting with backoff -------------
async function holdStream(a) {
  const route = 'stream';
  let backoff = 500;
  while (!stopping && Date.now() < until && !stats.unimplemented.has(route)) {
    a.ctrl = new AbortController();
    const t = performance.now();
    try {
      // Contract §4: tokens never go in URLs; streams use fetch + Authorization.
      const url = `${cfg.target}/api/sessions/${enc(cfg.sessionId)}/stream`;
      const res = await fetch(url, {
        headers: { accept: 'text/event-stream', authorization: `Bearer ${a.token}` },
        signal: a.ctrl.signal,
      });
      record(route, res.status, performance.now() - t);
      if (res.status === 404) { stats.unimplemented.add(route); await res.text(); return; }
      if (!res.ok || !res.body) throw new Error(`status ${res.status}`);
      stats.sse.open++;
      stats.sse.opened++;
      backoff = 500;
      const dec = new TextDecoder();
      let buf = '';
      try {
        for await (const chunk of res.body) {
          buf += dec.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            onSseEvent(buf.slice(0, i));
            buf = buf.slice(i + 2);
          }
        }
      } finally {
        stats.sse.open--;
      }
    } catch {
      if (stopping || Date.now() >= until) return;
      stats.sse.errors++;
    }
    if (stopping || Date.now() >= until) return;
    stats.sse.reconnects++;
    await sleep(backoff + Math.random() * backoff);
    backoff = Math.min(backoff * 2, 10_000);
  }
}

// ---- one virtual attendee -------------------------------------------------
async function attendee(i) {
  await sleep((cfg.rampS * 1000 * i) / cfg.attendees);
  if (stopping || Date.now() >= until) return;
  const joined = await call('join', 'POST', `/api/events/${enc(cfg.eventId)}/join`, {
    body: { joinCode: cfg.joinCode }, // packages/contracts JoinRequest
  });
  if (!joined?.token) { stats.joinFailed++; return; }
  stats.joined++;
  const a = { token: joined.token, lastSignal: {}, ctrl: null };
  const sid = enc(cfg.sessionId);
  await call('presence', 'POST', `/api/sessions/${sid}/presence`, { token: a.token, body: { kind: 'join' } });
  const stream = holdStream(a);

  while (!stopping && Date.now() < until) {
    const think = Math.min(-Math.log(1 - Math.random()) * cfg.thinkS, cfg.thinkS * 4);
    await sleep(Math.min(think * 1000, until - Date.now()));
    if (stopping || Date.now() >= until) break;
    const r = Math.random();
    if (r < 0.15) {
      const meta = {};
      const q = await call('ask', 'POST', `/api/sessions/${sid}/questions`, {
        token: a.token,
        body: { text: `[load] ${pick(QUESTIONS)}` },
        meta,
      });
      onAsked(q?.id ?? q?.questionId ?? q?.question?.id, meta.sentAt);
    } else if (r < 0.6 && knownQuestions.length) {
      await call('vote', 'POST', `/api/questions/${enc(pick(knownQuestions))}/vote`, { token: a.token });
    } else {
      // Contract rate limit: 1 per type per 30 s per attendee. Stay under it.
      const free = SIGNALS.filter((s) => Date.now() - (a.lastSignal[s] ?? 0) > 31_000);
      if (!free.length) continue;
      const type = pick(free);
      a.lastSignal[type] = Date.now();
      await call('signal', 'POST', `/api/sessions/${sid}/signals`, { token: a.token, body: { type } });
    }
  }
  a.ctrl?.abort();
  await stream;
  // Leave even when stopping, so occupancy drops back after the run.
  await call('presence', 'POST', `/api/sessions/${sid}/presence`, {
    token: a.token,
    body: { kind: 'leave' },
    force: true,
  });
}

// ---- reporting ------------------------------------------------------------
function summary() {
  const routes = {};
  for (const [k, r] of Object.entries(stats.routes)) {
    routes[k] = { n: r.n, codes: r.codes, p50: pct(r.ms, 50), p95: pct(r.ms, 95), p99: pct(r.ms, 99) };
  }
  const fanoutP95 = pct(stats.fanoutMs, 95);
  return {
    elapsedS: Math.round((Date.now() - t0Run) / 1000),
    joined: stats.joined,
    joinFailed: stats.joinFailed,
    sse: stats.sse,
    fanoutMs: { n: stats.fanoutMs.length, p50: pct(stats.fanoutMs, 50), p95: fanoutP95, p99: pct(stats.fanoutMs, 99) },
    fanoutSlo: fanoutP95 === null ? 'no data' : fanoutP95 < 1000 ? 'pass (p95 < 1000 ms)' : 'FAIL (p95 >= 1000 ms)',
    generatorLoopLagP99Ms: Math.round(loopLag.percentile(99) / 1e6),
    notBuiltYet: [...stats.unimplemented],
    routes,
  };
}
const progress = setInterval(() => {
  const s = summary();
  console.log(JSON.stringify({ progress: true, elapsedS: s.elapsedS, joined: s.joined, sseOpen: s.sse.open, fanoutP95: s.fanoutMs.p95, calls: Object.fromEntries(Object.entries(s.routes).map(([k, r]) => [k, r.n])) }));
}, 10_000);
progress.unref();

let finished = false;
function finish(reason) {
  if (finished) return;
  finished = true;
  console.log(JSON.stringify({ done: true, reason, config: cfg, ...summary() }, null, 2));
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { stopping = true; finish(sig); process.exit(130); });
}
setTimeout(() => { stopping = true; finish('hard-timeout'); process.exit(2); }, (cfg.durationS + 30) * 1000).unref();

console.log(JSON.stringify({ start: true, config: cfg }));
await Promise.all(Array.from({ length: cfg.attendees }, (_, i) => attendee(i)));
finish('duration');
process.exit(0);
