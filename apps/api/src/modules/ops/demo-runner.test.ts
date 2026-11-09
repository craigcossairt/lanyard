import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { channels } from '@lanyard/contracts';
import { actorId, createCrowd } from '../../../../worker/src/jobs/sim/scenario';
import { createBus } from '../../core/bus';
import type { ModuleContext } from '../../core/context';
import { verifyToken } from '../../core/tokens';
import { createDemoRunner, type SyntheticRecords } from './demo-runner';

test('demo uses role routes, retries arrivals, waits for reroute, and records scoped cleanup', async () => {
  const sets = new Map<string, Set<string>>();
  const hashes = new Map<string, Record<string, string>>();
  const kv = {
    exists: async () => 0,
    smembers: async (key: string) => [...(sets.get(key) ?? [])],
    sadd: async (key: string, value: string) => {
      const set = sets.get(key) ?? new Set<string>(); sets.set(key, set);
      const added = !set.has(value); set.add(value); return Number(added);
    },
    srem: async (key: string, value: string) => sets.get(key)?.delete(value),
    hgetall: async (key: string) => ({ ...hashes.get(key) }),
    hset: async (key: string, field: string, value: string) => {
      const hash = hashes.get(key) ?? {}; hashes.set(key, hash); hash[field] = value;
    },
    hdel: async (key: string, field: string) => { const hash = hashes.get(key); if (hash) delete hash[field]; },
    del: async (...keys: string[]) => { for (const key of keys) { sets.delete(key); hashes.delete(key); } },
  };
  const app = Fastify(); const bus = createBus(undefined); const secret = 'local-smoke-key';
  const occupants = new Map<string, string>();
  const counts = { caption: 0, question: 0, vote: 0, signal: 0, accept: 0 };
  let failArrival = true; let warnings = 0; let cleaned: SyntheticRecords | undefined;
  const start = Date.now(); let now = start;
  const run = { ...createCrowd('smoke', ['main', 'side'], 40, start), endsAt: new Date(start + 150_000).toISOString() };
  app.addHook('preHandler', async req => {
    const claims = verifyToken(secret, req.headers.authorization!.slice(7));
    assert.equal(claims.eventId, 'cnh-demos'); assert.match(claims.sub, /^sim_smoke_/);
    assert.equal(claims.role, req.url.endsWith('/transcript') ? 'speaker' : 'attendee');
  });
  app.post<{ Params: { id: string } }>('/api/sessions/:id/presence', async (req, reply) => {
    if (failArrival) { failArrival = false; return reply.code(503).send({}); }
    occupants.set(verifyToken(secret, req.headers.authorization!.slice(7)).sub, req.params.id); return {};
  });
  app.post<{ Body: { text: string } }>('/api/sessions/:id/transcript', async req => {
    assert.match(req.body.text, /^SIMULATED:/); counts.caption++; return { chunkId: `main:${counts.caption}`, seq: counts.caption };
  });
  app.post<{ Body: { type: string } }>('/api/sessions/:id/signals', async req => {
    assert.equal(req.body.type, 'louder'); counts.signal++; return { accepted: true };
  });
  app.post<{ Body: { text: string } }>('/api/sessions/:id/questions', async req => {
    assert.match(req.body.text, /^SIMULATED:/); const id = `q_${++counts.question}`;
    return { question: { id, sessionId: 'main', eventId: 'cnh-demos', anonId: 'sim_smoke_0', text: req.body.text,
      clusterId: 'c_1', votes: 0, status: 'open', at: new Date(now).toISOString() },
    cluster: { id: 'c_1', sessionId: 'main', label: 'SIMULATED', size: counts.question, votes: 0, representativeQuestionId: 'q_1' }, merged: counts.question > 1 };
  });
  app.post('/api/questions/:id/vote', async () => { counts.vote++; return {}; });
  app.post('/api/events/cnh-demos/reroute/accept', async () => { counts.accept++; return { accepted: true, sessionId: 'side' }; });
  await app.ready();
  const ctx = { kv, bus, config: { tokenSigningKey: secret }, logger: { warn() { warnings++; } } } as unknown as ModuleContext;
  const runner = createDemoRunner(app, ctx, async records => { cleaned = records; }, async () => true, () => now);
  try {
    for (let second = 0; second < 150; second++) {
      now = start + second * 1000; await runner.step(run); await runner.drain();
      if (second === 59) {
        assert.equal([...occupants.values()].filter(id => id === 'main').length, 20);
        assert.equal(counts.question, 12); assert.equal(counts.accept, 0);
      }
      if (second === 64) {
        assert.equal([...occupants.values()].filter(id => id === 'main').length, 34);
        for (let actor = 0; actor < 34; actor++) await bus.publish(channels.user(actorId(run, actor)), {
          type: 'reroute.suggested', at: new Date(now).toISOString(), payload: {
            anonId: actorId(run, actor), sessionId: 'side', suggestionId: `offer-${actor}`, reason: 'SIMULATED',
          },
        });
      }
    }
    await runner.cleanup(run);
    assert.equal(warnings, 1); // The injected arrival failure was retried.
    assert.deepEqual(counts, { caption: 30, question: 12, vote: 24, signal: 5, accept: 34 });
    assert.equal([...occupants.values()].filter(id => id === 'side').length, 40);
    assert.equal(cleaned?.questionIds.length, 12); assert.equal(cleaned?.chunkIds.length, 30);
    assert.equal(cleaned?.anonIds.length, 40); assert.equal(sets.size + hashes.size, 0);
  } finally { await runner.close(); await app.close(); await bus.close(); }
});
