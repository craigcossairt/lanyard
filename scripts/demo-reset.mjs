#!/usr/bin/env node
// Demo reset for CNH Demos (WS2). Wipes the live state of every cnh-demos session so the
// recording starts clean: transcript chunks (ES + Valkey caption tail + seq), questions,
// clusters, votes, questions:{sid}:count, signal zsets and rate limits, presence member sets
// (session and room), reroute suggestions from CNH rooms, catch-up cache and the sessions'
// SSE replay buffers. Then publishes clearing messages so open screens drop questions,
// clusters, attendance and signals. Captions have no clearing message: reload the screens.
//
// Refuses any event other than cnh-demos. Dry run by default (counts only); --apply wipes.
//   node --env-file=<path to .env> scripts/demo-reset.mjs            # dry run
//   node --env-file=<path to .env> scripts/demo-reset.mjs --apply    # wipe
// ES needs ES_URL + ES_API_KEY; Valkey needs VALKEY_URL (in-cluster only: run the Job in
// scripts/demo-reset/README.md for the Valkey part). Prints counts only, never text.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const EVENT = 'cnh-demos';
const SIGNAL_TYPES = ['slower', 'louder', 'cant_see', 'lost', 'thumbs_up', 'too_cold', 'too_hot'];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const eventArg = args.find((a) => a.startsWith('--event='))?.slice('--event='.length) ?? EVENT;
if (eventArg !== EVENT) {
  console.error(`refusing: demo-reset only runs on ${EVENT} (got ${JSON.stringify(eventArg)})`);
  process.exit(2);
}

// Dependencies: the repo's node_modules locally, /app/node_modules inside the app image.
const base = [
  join(process.cwd(), 'package.json'),
  '/app/apps/api/package.json',
  '/app/package.json',
].find(existsSync);
if (!base) {
  console.error('cannot find node_modules (run from the repo root or the app image)');
  process.exit(2);
}
const require = createRequire(base);

const out = { mode: apply ? 'apply' : 'dry-run', event: EVENT };

async function esPart() {
  const { ES_URL, ES_API_KEY } = process.env;
  if (!ES_URL || !ES_API_KEY) return { skipped: 'ES_URL/ES_API_KEY not set' };
  const { Client } = require('@elastic/elasticsearch');
  const es = new Client({
    node: ES_URL,
    auth: { apiKey: ES_API_KEY },
    requestTimeout: 15_000,
    maxRetries: 1,
  });
  const sessions = await es.search({
    index: 'cnh-sessions',
    size: 500,
    _source: ['id', 'roomId', 'eventId'],
    query: { term: { eventId: EVENT } },
  });
  const sess = sessions.hits.hits
    .map((h) => ({
      id: String(h._source?.id ?? h._id),
      roomId: String(h._source?.roomId ?? ''),
      eventId: h._source?.eventId,
    }))
    .filter((s) => s.eventId === EVENT);
  const rooms = await es.search({
    index: 'cnh-rooms',
    size: 100,
    _source: ['id', 'capacity', 'eventId'],
    query: { term: { eventId: EVENT } },
  });
  const roomList = rooms.hits.hits
    .map((h) => ({
      id: String(h._source?.id ?? h._id),
      capacity: Number(h._source?.capacity ?? 0),
      eventId: h._source?.eventId,
    }))
    .filter((r) => r.eventId === EVENT);
  const sids = sess.map((s) => s.id);
  const scope = (index) => ({
    index,
    query: { bool: { filter: [{ term: { eventId: EVENT } }, { terms: { sessionId: sids } }] } },
  });
  const counts = {};
  for (const index of ['cnh-transcripts', 'cnh-questions']) {
    if (sids.length === 0) {
      counts[index] = 0;
      continue;
    }
    if (apply) {
      const r = await es.deleteByQuery({ ...scope(index), conflicts: 'proceed', refresh: true });
      counts[index] = r.deleted ?? 0;
    } else {
      counts[index] = (await es.count(scope(index))).count;
    }
  }
  return { sessions: sess, rooms: roomList, counts };
}

async function scanAll(r, pattern) {
  const found = [];
  let cursor = '0';
  do {
    const [next, batch] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
    cursor = next;
    found.push(...batch);
  } while (cursor !== '0');
  return found;
}

async function valkeyPart(sessions, rooms) {
  const url = process.env.VALKEY_URL;
  if (!url) return { skipped: 'VALKEY_URL not set (run the in-cluster Job for this part)' };
  const { Redis } = require('ioredis');
  const r = new Redis(url, { connectTimeout: 3000, commandTimeout: 3000, maxRetriesPerRequest: 1 });
  const roomIds = new Set(rooms.map((x) => x.id));
  const cap = new Map(rooms.map((x) => [x.id, x.capacity]));
  const now = () => new Date().toISOString();
  const c = {
    captions: 0,
    questions: 0,
    clusters: 0,
    signals: 0,
    members: 0,
    roomMembers: 0,
    reroutes: 0,
    keys: 0,
  };
  const del = [];
  const messages = []; // [channel, json]

  for (const s of sessions) {
    const sid = s.id;
    c.captions += await r.llen(`live:s:${sid}:captions`);
    const qids = await r.lrange(`live:s:${sid}:questions`, 0, -1);
    c.questions += qids.length;
    for (const q of qids) {
      del.push(`live:q:${q}`, `live:q:${q}:voters`);
      const cid = await r.hget(`live:q:${q}`, 'clusterId');
      messages.push([
        `session:${sid}`,
        {
          type: 'question.updated',
          at: now(),
          payload: { questionId: q, clusterId: cid || q, votes: 0, status: 'hidden' },
        },
      ]);
    }
    const cids = await r.smembers(`live:s:${sid}:clusters`);
    c.clusters += cids.length;
    for (const cid of cids) {
      del.push(`live:c:${cid}`, `live:c:${cid}:labeling`, `live:c:${cid}:relabel_pending`);
      messages.push([
        `session:${sid}`,
        {
          type: 'cluster.updated',
          at: now(),
          payload: { clusterId: cid, label: '', size: 0, votes: 0 },
        },
      ]);
    }
    for (const t of SIGNAL_TYPES) {
      c.signals += await r.zcard(`signals:${sid}:${t}`);
      del.push(`signals:${sid}:${t}`);
    }
    const members = await r.smembers(`session:${sid}:members`);
    c.members += members.length;
    for (const a of members) {
      if ((await r.hget(`attendee:${a}:at`, 'sessionId')) === sid) del.push(`attendee:${a}:at`);
    }
    del.push(
      `live:s:${sid}:captions`,
      `live:s:${sid}:seq`,
      `live:s:${sid}:questions`,
      `live:s:${sid}:clusters`,
      `questions:${sid}:count`,
      `session:${sid}:members`,
      `sse:buf:session:${sid}`,
      ...(await scanAll(r, `live:rl:${sid}:*`)),
      ...(await scanAll(r, `live:catchup:${sid}:*`)),
    );
    const attendance = {
      type: 'attendance.updated',
      at: now(),
      payload: { sessionId: sid, roomId: s.roomId, count: 0, capacity: cap.get(s.roomId) ?? 0 },
    };
    const window = {
      type: 'signals.window',
      at: now(),
      payload: { sessionId: sid, roomId: s.roomId, windowSec: 60, counts: {} },
    };
    for (const ch of [`session:${sid}`, `ops:${EVENT}`])
      messages.push([ch, attendance], [ch, window]);
  }
  for (const room of roomIds) {
    c.roomMembers += await r.scard(`room:${room}:members`);
    del.push(`room:${room}:members`);
  }
  // Reroute suggestions that point away from a CNH room, and CNH reroute locks.
  for (const key of await scanAll(r, 'reroute:*')) {
    if (key.endsWith(':accepted')) continue;
    if (roomIds.has((await r.hget(key, 'fromRoomId')) ?? '')) {
      c.reroutes++;
      del.push(key, `${key}:accepted`);
    }
  }
  del.push(...(await scanAll(r, `ops:${EVENT}:reroute:*`)));

  const unique = [...new Set(del)];
  c.keys = apply
    ? 0
    : (await Promise.all(unique.map((k) => r.exists(k)))).reduce((a, b) => a + b, 0);
  if (apply) {
    for (let i = 0; i < unique.length; i += 500) c.keys += await r.del(...unique.slice(i, i + 500));
    for (const [ch, msg] of messages) await r.publish(ch, JSON.stringify(msg));
    c.published = messages.length;
  }
  r.disconnect();
  return c;
}

try {
  const es = await esPart();
  out.es = es.counts ?? es;
  const sessions = es.sessions ?? [];
  out.sessions = sessions.map((s) => s.id);
  out.valkey = sessions.length
    ? await valkeyPart(sessions, es.rooms ?? [])
    : { skipped: 'no sessions (ES needed to list them)' };
  console.log(JSON.stringify(out, null, 2));
  if (!apply) console.log('dry run: nothing changed. Re-run with --apply to wipe.');
  else console.log('done. Reload the recording screens (captions clear on a fresh load).');
} catch (err) {
  console.error(
    'demo-reset failed:',
    err?.meta?.statusCode ?? '',
    err?.name ?? '',
    err?.message ?? err,
  );
  process.exit(1);
}
