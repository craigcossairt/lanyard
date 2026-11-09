import { pathToFileURL } from 'node:url';
import { request, fail } from './client.mjs';

const fields = (type, names) => Object.fromEntries(names.split(' ').map(name => [name, { type }]));
const keywords = names => fields('keyword', names);
const text = names => fields('text', names);
const searchable = names => Object.fromEntries(names.split(' ').map(name => [name, { type: 'text', copy_to: 'semantic' }]));
const dates = names => fields('date', names);
const semantic = { type: 'semantic_text' };

export const mappings = {
  'cnh-events': { ...keywords('id joinCode timezone'), ...text('name venueName'), ...dates('startsAt endsAt') },
  'cnh-rooms': {
    ...keywords('id eventId'), ...text('name'), ...fields('integer', 'capacity floor'), ...fields('float', 'x y'),
    accessibility: { properties: fields('boolean', 'stepFree hearingLoop quiet') },
  },
  'cnh-speakers': { ...keywords('id'), ...text('name title company bio') },
  'cnh-sessions': {
    ...keywords('id eventId roomId track level tags speakerIds status'), ...searchable('title abstract speakerNames'),
    ...dates('startsAt endsAt'), semantic,
  },
  'cnh-transcripts': {
    ...keywords('id sessionId eventId lang source'), ...fields('integer', 'seq'), ...dates('startedAt endedAt'),
    ...searchable('text'), semantic,
  },
  'cnh-questions': {
    ...keywords('id sessionId eventId anonId clusterId status'), ...fields('integer', 'votes'), ...dates('at'),
    ...searchable('text'), semantic,
  },
  'cnh-signals': { ...keywords('sessionId roomId eventId type anonId'), ...dates('at') },
  'cnh-presence': { ...keywords('eventId roomId sessionId anonId kind'), ...dates('at') },
  'cnh-people': { ...keywords('anonId eventId'), ...searchable('interests'), semantic },
  'cnh-booths': { ...keywords('id eventId tags'), ...text('vendorName'), ...searchable('description'), semantic },
};

export async function setup({ recreate = false } = {}) {
  for (const [index, properties] of Object.entries(mappings)) {
    const exists = await request(`/${index}`, { method: 'HEAD', allow404: true, timeoutMs: 10_000 });
    if (exists && !recreate) {
      console.log(JSON.stringify({ index, action: 'kept' }));
      continue;
    }
    if (exists) await request(`/${index}`, { method: 'DELETE', timeoutMs: 60_000 });
    await request(`/${index}`, { method: 'PUT', body: { mappings: { properties } }, timeoutMs: 60_000 });
    console.log(JSON.stringify({ index, action: 'created' }));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  setup({ recreate: process.argv.includes('--recreate') }).catch(fail);
}
