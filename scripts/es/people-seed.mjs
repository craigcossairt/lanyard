import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { request, fail } from './client.mjs';
import { setupPeopleMapping } from './people-mapping.mjs';

const attendees = [
  ['Moss Finch', 'Meet observability platform teams', 'Can share Kubernetes tracing rollout lessons', 'OpenTelemetry, Kubernetes'],
  ['Indigo Badger', 'Find practical AI inference operators', 'Can help with GPU scheduling and model serving', 'AI inference, platform engineering'],
  ['Copper Heron', 'Learn how teams make telemetry affordable', 'Can share cardinality controls and sampling patterns', 'metrics, OpenTelemetry'],
  ['Sage Lynx', 'Meet people modernizing developer platforms', 'Can compare GitOps rollout approaches', 'GitOps, internal developer platforms'],
  ['Amber Fox', 'Find teams improving software supply chains', 'Can share SBOM and signing workflows', 'security, Kubernetes'],
  ['Slate Robin', 'Talk with people running Postgres on Kubernetes', 'Can help with backup and failover design', 'CloudNativePG, databases'],
  ['Cobalt Otter', 'Meet observability engineers', 'Can share eBPF profiling experience', 'eBPF, tracing'],
  ['Willow Hare', 'Find practical ways to reduce cloud spend', 'Can help tune autoscaling and workload requests', 'FinOps, Kubernetes'],
  ['Coral Wolf', 'Meet people building reliable AI services', 'Can compare inference gateway designs', 'AI inference, SRE'],
  ['Juniper Jay', 'Learn about multi-cluster operations', 'Can share fleet policy and upgrade patterns', 'platform engineering, GitOps'],
  ['Silver Elk', 'Find teams improving incident response', 'Can help design actionable SLOs', 'SRE, observability'],
  ['Azure Moth', 'Talk with security platform builders', 'Can share workload identity practices', 'security, cloud native'],
  ['Maple Kite', 'Meet people using OpenTelemetry in production', 'Can help with collector pipelines', 'OpenTelemetry, telemetry'],
  ['Crimson Bear', 'Find developers simplifying Kubernetes apps', 'Can compare operator and platform approaches', 'Kubernetes, developer experience'],
  ['Linen Finch', 'Learn about policy as code', 'Can share admission control lessons', 'security, policy'],
  ['Forest Seal', 'Meet database reliability engineers', 'Can discuss Postgres recovery drills', 'Postgres, SRE'],
  ['Goldfinch Ray', 'Find teams improving service networking', 'Can share mesh migration lessons', 'networking, Kubernetes'],
  ['Violet Stoat', 'Talk with people evaluating vector search', 'Can compare search and retrieval architectures', 'AI, Elasticsearch'],
  ['Cloud Hare', 'Meet platform teams adopting GitOps', 'Can help with safe progressive delivery', 'Argo CD, delivery'],
  ['Pine Badger', 'Find teams scaling metrics safely', 'Can share Prometheus federation patterns', 'Prometheus, observability'],
  ['Dune Lark', 'Learn how to secure software delivery', 'Can help with provenance and attestations', 'supply chain, security'],
  ['River Lynx', 'Meet engineers building event-driven systems', 'Can share queue and backpressure practices', 'distributed systems, SRE'],
  ['Sky Heron', 'Find teams running AI workloads on Kubernetes', 'Can compare GPU scheduling tradeoffs', 'AI inference, Kubernetes'],
  ['Birch Fox', 'Talk about accessible developer tooling', 'Can share inclusive platform design practices', 'accessibility, developer experience'],
  ['Cloud Finch', 'Meet people improving production debugging', 'Can help connect traces, logs, and profiles', 'OpenTelemetry, eBPF'],
];

function documentFor([handle, needs, offers, interests], index) {
  const anonId = `demo-networker-${String(index + 1).padStart(2, '0')}`;
  return {
    anonId,
    eventId: 'cnh-demos',
    handle,
    linkedinUrl: `https://www.linkedin.com/in/example-${index + 1}`,
    needs,
    offers,
    interests,
    consented: true,
    seeded: true,
  };
}

export async function seedPeople({ reset = false } = {}) {
  await setupPeopleMapping();
  if (reset) {
    await request('/cnh-people/_delete_by_query?refresh=true', {
      method: 'POST',
      body: { query: { bool: { filter: [{ term: { eventId: 'cnh-demos' } }, { term: { seeded: true } }] } } },
      timeoutMs: 10_000,
    });
  }
  for (const [index, row] of attendees.entries()) {
    const document = documentFor(row, index);
    const body = [
      JSON.stringify({ index: { _index: 'cnh-people', _id: `cnh-demos:${document.anonId}` } }),
      JSON.stringify(document),
    ].join('\n') + '\n';
    for (let attempt = 0; ; attempt += 1) {
      const result = await request('/_bulk?refresh=false', {
        method: 'POST',
        body,
        ndjson: true,
        timeoutMs: 30_000,
      });
      if (!result.errors) break;
      const operation = Object.values(result.items?.[0] ?? {})[0];
      if (
        operation?.status === 429 &&
        operation.error?.type === 'inference_exception' &&
        attempt < 4
      ) {
        await delay(2_000 * 2 ** attempt);
        continue;
      }
      const key = `${operation?.status ?? 'unknown'}:${operation?.error?.type ?? 'unknown'}`;
      console.error(JSON.stringify({ eventId: 'cnh-demos', action: 'seed-error', failure: key }));
      throw new Error('Elasticsearch bulk seed failed');
    }
    await delay(200);
  }
  await request('/cnh-people/_refresh', { method: 'POST', timeoutMs: 10_000 });
  console.log(JSON.stringify({ eventId: 'cnh-demos', action: 'seeded', count: attendees.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedPeople({ reset: process.argv.includes('--reset') }).catch(fail);
}
