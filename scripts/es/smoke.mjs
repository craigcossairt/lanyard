import assert from 'node:assert/strict';
import { request, fail } from './client.mjs';
import { readSeed, validate } from './seed.mjs';

export function hybridQuery(query, eventId) {
  const filter = { term: { eventId } };
  return {
    size: 5, _source: ['id', 'title', 'eventId', 'track'],
    retriever: { rrf: { rank_window_size: 50, rank_constant: 60, retrievers: [
      { standard: { query: { bool: { filter, must: { multi_match: { query, fields: ['title^3', 'abstract', 'speakerNames'] } } } } } },
      { standard: { query: { bool: { filter, must: { semantic: { field: 'semantic', query } } } } } },
    ] } },
  };
}

async function smoke() {
  const fixture = await readSeed();
  validate(fixture);
  assert.equal(fixture.events.find(e => e.id === 'cnh-demos').timezone, 'America/Denver');
  assert.equal(fixture.rooms.find(r => r.id === 'cnh-main-stage').capacity, 30);
  assert.equal(fixture.rooms.find(r => r.id === 'cnh-side-stage').capacity, 100);
  const demoSessions = fixture.sessions.filter(s => s.eventId === 'cnh-demos');
  assert.equal(demoSessions.length, 2);
  assert.equal(demoSessions[0].startsAt, demoSessions[1].startsAt);
  if (process.argv.includes('--offline')) {
    console.log(JSON.stringify({ smoke: 'passed', mode: 'offline', sessions: fixture.sessions.length }));
    return;
  }
  await request('/', { timeoutMs: 10_000 }); // Establish TLS before measuring the query budget.
  const result = await request('/cnh-sessions/_search', { method: 'POST', body: hybridQuery('eBPF but for security folks', 'kubecon-na-2026') });
  assert.equal(result.timed_out, false);
  assert.equal(result.hits.hits.length, 5);
  assert.ok(result.hits.hits.every(hit => hit._source.eventId === 'kubecon-na-2026'));
  // Public seed titles are intentionally printed as required demo/PR evidence.
  console.log(JSON.stringify({ smoke: 'passed', mode: 'hybrid-rrf', topFive: result.hits.hits.map(hit => hit._source.title) }));
}

smoke().catch(fail);
