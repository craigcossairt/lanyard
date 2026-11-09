# Gitar config drafts (copied into `.gitar/` at 11:00)

These follow Gitar's documented layout:
- `.gitar/review/*.md`: plain-Markdown review instructions
- `.gitar/rules/*.md`: natural-language conditional rules
- `.gitar/config/apply.md`: auto-apply criteria, read from the default branch

Before copying, check https://docs.gitar.ai/features/rules.md for any frontmatter that the rules need.

---
## `.gitar/review/observability.md`
# Observability conventions (Dash0 / OpenTelemetry)
- Every new HTTP route must be covered by the server's auto-instrumentation. Do not bypass the shared Fastify instance.
- Every outbound call (Elasticsearch, LLM, Valkey, worker HTTP) must go through the shared client wrappers that create a span and set an explicit timeout. ES 2s, LLM 20s (catch-up 8s), Valkey 500ms. Flag raw `fetch`, raw ES client, or raw OpenAI client usage outside `core/`.
- Errors must be recorded on the active span and logged once with the structured logger, not swallowed.
- New metrics must use the names and attributes listed in `docs/plan/02-contracts.md` section 6. Flag any metric attribute containing an attendee id, free text, or another unbounded value.

## `.gitar/review/privacy.md`
# Privacy conventions
- Question text, caption text, attendee interests and preferences must never appear in logs, span attributes, span events, metric attributes, or error messages.
- Attendees are anonymous. Flag any field that stores email, real name, phone, or device identifiers for attendees.
- Secrets come only from environment variables. Flag any literal key, token, or connection string.

## `.gitar/review/time.md`
# Time handling
- Store and transmit times as UTC ISO-8601 strings.
- Render times only through the shared event-timezone helper (event timezone `America/Denver`). Flag `toLocaleString` without an explicit timezone, manual offset math, and parsing of local time strings.

## `.gitar/review/accessibility.md`
# Accessibility (Merge Forward)
- Interactive elements need accessible names. Icon-only buttons need `aria-label`.
- Color must never be the only signal. Status chips need text or icons too.
- Respect `prefers-reduced-motion`. Layout must survive 200% text size.
- Live regions (captions, new questions) must use polite announcements and must not steal focus.

## `.gitar/review/kubernetes.md`
# Kubernetes conventions
- Every container sets CPU and memory requests and limits. The team budget is 2 CPU / 4 GiB requests and 4 CPU / 8 GiB limits in total, so flag changes that exceed it.
- No privileged pods, hostPath, hostNetwork or hostPID (the cluster refuses them).
- Secrets are referenced via `secretKeyRef` to `app-credentials`, never inlined.
- `deploy/kustomization.yaml` image tags are managed by the deploy bot. Flag manual edits.

---
## `.gitar/rules/api-contract-sync.md`
When a pull request changes files under `apps/api/src/modules/` or `packages/contracts/` in a way that adds, removes or changes a route, request/response shape, or realtime message type:
- verify that `docs/plan/02-contracts.md` is updated in the same pull request, and
- verify that the web client usage under `apps/web/src/` is updated or still compatible.
If either is missing, request changes and name the specific route or message.

## `.gitar/rules/ownership.md`
When a pull request from a branch named `ws<N>/...` modifies folders owned by a different workstream (see the ownership table in `docs/plan/02-contracts.md` section 1), comment with the list of out-of-scope files and ask for explicit orchestrator approval in the PR description.

## `.gitar/rules/deploy-budget.md`
When a pull request changes files under `deploy/`, sum the resource requests and limits across all workloads and comment with the totals against the budget (2 CPU / 4 GiB requests, 4 CPU / 8 GiB limits).

---
## `.gitar/config/apply.md`
Auto-apply fixes for:
- CI failures in typecheck, lint, formatting, or build caused by the pull request's own changes
- missing imports, type mismatches against `packages/contracts`, and unused variables

Do not auto-apply changes to:
- `deploy/`, `argocd/`, `.github/workflows/`, `.gitar/`, `docs/plan/`
- anything involving secrets or environment configuration

Prefer the smallest fix that makes CI green, and explain the root cause in the commit message.
