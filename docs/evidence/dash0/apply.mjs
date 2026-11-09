#!/usr/bin/env node
// Upserts the Conference Ops dashboard and the two SLOs into Dash0, and writes
// their JSON next to this file as evidence. Needs DASH0_AUTH_TOKEN with "All
// permissions" (load it at runtime; never commit it):
//   node --env-file=<path to .env> docs/evidence/dash0/apply.mjs [--dry-run]
// Prints only HTTP status codes, ids and app URLs. Never prints the token.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dashboard, slos } from './definitions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes('--dry-run');
const dataset = process.env.DASH0_DATASET || 'default';

writeFileSync(join(here, 'conference-ops.dashboard.json'), JSON.stringify(dashboard, null, 2) + '\n');
for (const [origin, slo] of Object.entries(slos)) {
  writeFileSync(join(here, `${origin}.slo.json`), JSON.stringify(slo, null, 2) + '\n');
}
console.log('wrote definitions JSON');
if (dryRun) process.exit(0);

const token = process.env.DASH0_AUTH_TOKEN;
if (!token) { console.error('DASH0_AUTH_TOKEN is not set'); process.exit(1); }
const region = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '').match(/ingress\.([a-z0-9-]+)\.aws\.dash0\.com/)?.[1] || 'us-west-2';
const api = `https://api.${region}.aws.dash0.com`;

async function upsert(kind, origin, body) {
  const url = `${api}/api/${kind}/${encodeURIComponent(origin)}?dataset=${dataset}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.log(JSON.stringify({ kind, origin, status: e?.name === 'TimeoutError' ? 'TIMEOUT (15 s)' : 'ERR', error: e?.cause?.code ?? e?.name }));
    return false;
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  const id = json?.metadata?.labels?.['dash0.com/id'] ?? json?.metadata?.dash0Extensions?.id ?? json?.id ?? null;
  // On error, show the server's validation message (it never echoes the token).
  console.log(JSON.stringify({ kind, origin, status: res.status, id, error: res.ok ? undefined : text.slice(0, 600) }));
  return res.ok;
}

let ok = await upsert('dashboards', 'lanyard-conference-ops', dashboard);
for (const [origin, slo] of Object.entries(slos)) ok = (await upsert('slos', origin, slo)) && ok;
process.exit(ok ? 0 : 1);
