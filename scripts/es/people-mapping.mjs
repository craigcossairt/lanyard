import { pathToFileURL } from 'node:url';
import { request, fail } from './client.mjs';

/** Adds the networking fields to the existing cnh-people index without recreating it. */
export async function setupPeopleMapping() {
  await request('/cnh-people/_mapping', {
    method: 'PUT',
    body: {
      properties: {
        anonId: { type: 'keyword' },
        eventId: { type: 'keyword' },
        handle: { type: 'keyword' },
        linkedinUrl: { type: 'keyword', index: false },
        consented: { type: 'boolean' },
        seeded: { type: 'boolean' },
        needs: { type: 'text', copy_to: 'semantic' },
        offers: { type: 'text', copy_to: 'semantic' },
        interests: { type: 'text', copy_to: 'semantic' },
        semantic: { type: 'semantic_text' },
      },
    },
    timeoutMs: 10_000,
  });
  console.log(JSON.stringify({ index: 'cnh-people', action: 'networking-mapping-updated' }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  setupPeopleMapping().catch(fail);
}
