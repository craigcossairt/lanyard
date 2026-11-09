// Backstop redaction (02-contracts section 4): tokens never belong in URLs, but if one
// arrives in a query string it must not reach logs or span attributes.
const SENSITIVE = new Set(['token', 'access_token', 't', 'key', 'api_key', 'apikey']);

function decodeName(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' ')).trim().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/** Redacts sensitive query params, matching names after percent-decoding (%74oken). */
export function redactUrl(url: string): string {
  const q = url.indexOf('?');
  if (q < 0) return url;
  const hash = url.indexOf('#', q);
  const query = url.slice(q + 1, hash < 0 ? undefined : hash);
  const redacted = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const name = eq < 0 ? pair : pair.slice(0, eq);
      return SENSITIVE.has(decodeName(name)) ? `${name}=[REDACTED]` : pair;
    })
    .join('&');
  return `${url.slice(0, q)}?${redacted}`;
}

/**
 * pino `req` serializer: method and redacted URL only. No headers (Authorization),
 * no remote address, no body.
 */
export function reqSerializer(req: { method?: string; url?: string }): {
  method?: string;
  url?: string;
} {
  return { method: req.method, url: req.url ? redactUrl(req.url) : undefined };
}
