// Backstop redaction (02-contracts section 4): tokens never belong in URLs, but if one
// arrives in a query string it must not reach logs or span attributes.
const SENSITIVE_PARAM = /([?&])(token|access_token|t|key|api_key)=[^&#]*/gi;

export function redactUrl(url: string): string {
  return url.replace(SENSITIVE_PARAM, '$1$2=[REDACTED]');
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
