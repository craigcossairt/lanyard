import { randomUUID } from 'node:crypto';
import { request, fail } from './client.mjs';

async function verify() {
  const info = await request('/', { timeoutMs: 10_000 });
  console.log(JSON.stringify({ version: info.version.number }));
  const endpoints = await request('/_inference', { timeoutMs: 10_000 });
  console.log(JSON.stringify({ inferenceEndpoints: endpoints.endpoints.map(({ inference_id, task_type }) => ({ id: inference_id, task: task_type })) }));
  const index = `cnh-ws1-probe-${randomUUID()}`;
  try {
    await request(`/${index}`, { method: 'PUT', body: { mappings: { properties: { text: { type: 'text', copy_to: 'semantic' }, semantic: { type: 'semantic_text' } } } }, timeoutMs: 60_000 });
    await request(`/${index}/_doc/probe?refresh=wait_for`, {
      method: 'PUT', body: { text: 'Kernel runtime threat detection with programmable Linux probes for incident responders.' }, timeoutMs: 120_000,
    });
    const mapping = await request(`/${index}/_mapping`, { timeoutMs: 10_000 });
    const result = await request(`/${index}/_search`, { method: 'POST', body: { query: { semantic: { field: 'semantic', query: 'eBPF but for security folks' } } } });
    if (result.hits.hits[0]?._id !== 'probe') throw new Error('Semantic probe did not retrieve its document');
    console.log(JSON.stringify({ semanticProbe: 'passed', inferenceId: mapping[index].mappings.properties.semantic.inference_id }));
  } finally {
    await request(`/${index}`, { method: 'DELETE', timeoutMs: 60_000, allow404: true });
  }
}

verify().catch(fail);
