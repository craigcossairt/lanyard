# Observability conventions (Dash0 / OpenTelemetry)
- Every new HTTP route must be covered by the server's auto-instrumentation. Do not bypass the shared Fastify instance.
- Every outbound call (Elasticsearch, LLM, Valkey, worker HTTP) must go through the shared client wrappers that create a span and set an explicit timeout. ES 2s, LLM 20s (catch-up 8s), Valkey 500ms. Flag raw `fetch`, raw ES client, or raw OpenAI client usage outside `core/`.
- Errors must be recorded on the active span and logged once with the structured logger, not swallowed.
- New metrics must use the names and attributes listed in `docs/plan/02-contracts.md` section 6. Flag any metric attribute containing an attendee id, free text, or another unbounded value.
