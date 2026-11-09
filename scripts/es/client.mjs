// Dependency-free runtime helper. Never log credentials or response bodies.
export async function request(path, { method = 'GET', body, timeoutMs = 2_000, allow404 = false, ndjson = false } = {}) {
  const { ES_URL, ES_API_KEY } = process.env;
  if (!ES_URL || !ES_API_KEY) throw new Error('ES_URL and ES_API_KEY are required');
  const base = new URL(ES_URL);
  if (base.protocol !== 'https:' || !base.hostname.includes('.es.') || base.username || base.password) {
    throw new Error('ES_URL must be the HTTPS Elasticsearch .es. endpoint without embedded credentials');
  }
  const response = await fetch(new URL(path, base), {
    method, signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `ApiKey ${ES_API_KEY}`, 'Content-Type': ndjson ? 'application/x-ndjson' : 'application/json' },
    body: body === undefined ? undefined : ndjson ? body : JSON.stringify(body),
  });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`Elasticsearch ${method} failed (HTTP ${response.status})`);
  return method === 'HEAD' ? true : response.json();
}

export function fail(error) {
  // fetch errors may contain sensitive URLs; emit only controlled messages.
  const message = /^(ES_URL|Elasticsearch |Semantic |Bulk |Seed |Smoke )/.test(error.message)
    ? error.message
    : error.name === 'AssertionError' ? 'Smoke assertion failed'
    : error.name === 'TimeoutError' ? 'Elasticsearch operation timed out' : 'Elasticsearch operation failed; check connectivity and input';
  console.error(JSON.stringify({ error: message }));
  process.exitCode = 1;
}
