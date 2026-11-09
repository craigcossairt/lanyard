import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { request, fail } from './client.mjs';

export async function readSeed() {
  return JSON.parse(await readFile(new URL('../../data/seed/conference.json', import.meta.url), 'utf8'));
}

export function validate(seed) {
  for (const key of ['events', 'rooms', 'speakers', 'sessions']) {
    if (!Array.isArray(seed[key]) || !seed[key].length || new Set(seed[key].map(d => d.id)).size !== seed[key].length) throw new Error('Seed arrays must contain unique stable ids');
  }
  const events = new Map(seed.events.map(e => [e.id, e]));
  const rooms = new Map(seed.rooms.map(r => [r.id, r]));
  const speakers = new Set(seed.speakers.map(s => s.id));
  for (const room of seed.rooms) {
    if (!events.has(room.eventId) || !Number.isInteger(room.capacity) || room.capacity < 1) throw new Error('Seed room has an invalid event or capacity');
  }
  for (const doc of [...seed.events, ...seed.sessions]) {
    if (![doc.startsAt, doc.endsAt].every(t => typeof t === 'string' && t.endsWith('Z') && Number.isFinite(Date.parse(t))) || Date.parse(doc.startsAt) >= Date.parse(doc.endsAt)) throw new Error('Seed timestamps must be ordered UTC dates');
  }
  for (const s of seed.sessions) {
    if (!events.has(s.eventId) || rooms.get(s.roomId)?.eventId !== s.eventId || s.speakerIds.some(id => !speakers.has(id))) throw new Error('Seed session references an unknown entity');
    if (s.startsAt < events.get(s.eventId).startsAt || s.endsAt > events.get(s.eventId).endsAt) throw new Error('Seed session falls outside its event');
  }
}

export async function seed() {
  const fixture = await readSeed();
  validate(fixture);
  for (const entity of ['events', 'rooms', 'speakers', 'sessions']) {
    let created = 0;
    let kept = 0;
    for (let offset = 0; offset < fixture[entity].length; offset += 50) {
      const lines = fixture[entity].slice(offset, offset + 50).flatMap(doc => [
        JSON.stringify({ create: { _index: `cnh-${entity}`, _id: doc.id } }),
        JSON.stringify(doc),
      ]);
      const result = await request('/_bulk', { method: 'POST', body: `${lines.join('\n')}\n`, ndjson: true, timeoutMs: 120_000 });
      const failures = result.items.filter(({ create }) => create.status !== 201 && create.status !== 409);
      if (failures.length) throw new Error(`Bulk seed failed for ${failures.length} documents (HTTP ${failures[0].create.status})`);
      created += result.items.filter(({ create }) => create.status === 201).length;
      kept += result.items.filter(({ create }) => create.status === 409).length;
    }
    console.log(JSON.stringify({ index: `cnh-${entity}`, created, kept }));
  }
  await request('/cnh-events,cnh-rooms,cnh-speakers,cnh-sessions/_refresh', { method: 'POST', timeoutMs: 60_000 });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) seed().catch(fail);
