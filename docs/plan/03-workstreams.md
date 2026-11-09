# Workstreams: briefs for each delegated agent

The orchestrator pastes the **common preamble** and then **one brief** into each `delegate_task`. Every agent runs in its own git worktree (`isolation: "worktree"`).

## Harness assignment
Spread the work across providers. The main reason is rate-limit headroom with about 8 concurrent agents. A second reason is that different model families catch different mistakes.

The **MCP constraint** decides two of the assignments. The Radar and Dash0 MCP servers are configured for Claude Code (user scope) on this Mac. Workstreams that must call those MCPs (WS0, WS5) run on a Claude provider. Other harnesses don't get those tools.

| WS | Name | Default harness and model | Starts | Depends on |
|---|---|---|---|---|
| WS0 | Platform skeleton | Claude Hub: claude-opus-5-5, effort high | 11:20 | Repo setup |
| WS1 | Search and intelligence (ES) | Codex: gpt-6.1-sol, reasoning high | 11:20 (ES prep), full at 12:00 | WS0 contracts package |
| WS2 | Live session backend and realtime | Claude Hub: claude-opus-5-5, effort high | 12:00 | WS0 |
| WS3 | Attendee and speaker UI | Claude: claude-fable-5-1, effort high | 12:00 | WS0 shell; design tokens by about 13:30 |
| WS4 | Organizer ops and conference telemetry | Codex: gpt-6-astra, reasoning high | 12:00 | WS0 |
| WS5 | Reliability: Dash0, Radar, k8s, load tests | Claude Hub: claude-opus-5-5, effort high | 11:20 | Repo setup |
| WS6 | Accessibility and i18n (Merge Forward) | Cursor: grok-4.7 (or claude-sonnet-5-5) | 13:30 | WS3 first screens |
| WS7 | Vendor view (P1) | Codex: gpt-6-luna, reasoning high | 14:00 if P0 is on track | WS1 |
| WS8 | Venue view (P2) | Cursor: composer-2.5 | 15:00 if P0 is green | WS4 |

Every agent starts on `fastMode: false` unless the orchestrator sees it idling on trivial work. Swap models freely if one stalls; the briefs are harness-neutral.

---

## Common preamble (paste at the top of every brief)
> You are one of about 8 parallel agents building **Lanyard** for the Cloud Native Hackathon. The hard deadline is 17:30 MT, so ship working vertical slices fast.
>
> **Read first:** `AGENTS.md`, `docs/plan/01-PRD.md`, `docs/plan/02-contracts.md`, and your brief below. The contracts are the source of truth. If you need a contract change, make it in a tiny separate PR that updates `packages/contracts` **and** `docs/plan/02-contracts.md`, and tell the orchestrator.
>
> **Rules:**
> - Edit only the folders your brief owns, plus new files inside them. Never edit another workstream's folders, `packages/contracts` (except as above), `deploy/` (WS5 only) or `.gitar/`.
> - Work as **small PRs** of about 400 changed lines or fewer, one vertical slice each. Name branches `ws<N>/<slug>`. Fill in the PR template, including **AI usage: <harness/model>**.
> - CI must be green. Then address every Gitar comment, by fixing it or replying with a reason. **Do not merge.** The orchestrator merges. While a PR waits, start the next slice from latest `main`.
> - Follow the conventions in `02-contracts.md` sections 6 to 8: spans and timeouts on every outbound call, no text or PII in logs, spans or metric labels, UTC storage, and the event-timezone helper for display.
> - No tests beyond a fast smoke test per route or module. Typecheck and lint must pass.
> - Secrets come only from env. Never write a real key into any file.
> - When done or blocked, finish with: what merged, PR URLs, what's left, and any contract or decision changes.

---

## WS0: Platform skeleton (critical path; target done by 12:00)
**Owns:** `apps/api/src/core/`, `apps/web/src/app/`, `apps/worker/` (bootstrap only), `packages/contracts/`, the root workspace config, and the Dockerfile together with WS5.

**Deliver, merged in this order:**
1. **Monorepo:**
   - npm workspaces with `apps/api`, `apps/web`, `apps/worker` and `packages/contracts`.
   - Shared tsconfig, ESLint and Prettier.
   - Root scripts: `dev`, `build`, `typecheck`, `lint`.
   - A Dockerfile producing one image whose `ROLE` env selects api or worker. The API serves the built SPA.
   - `/healthz` and `/readyz`.
   - The starter's deploy keeps working. Coordinate with WS5 on the Dockerfile, and check that the first deploy goes green at the public URL.
2. **`packages/contracts`:** every entity, API payload, realtime message type and metric name from `02-contracts.md`, plus validation schemas.
3. **API core:**
   - Fastify server and config loader.
   - **OpenTelemetry bootstrap, loaded first**, plus a pino logger with trace ids.
   - An ES client wrapper with spans and timeouts.
  - A Jev decision wrapper (`@typesafe-ai/sdk`, 1 s timeout, a span carrying the chosen label and its probability, OpenAI moderation fallback).
   - A Valkey pub/sub bus with a typed publish/subscribe API.
   - The SSE helper, with heartbeat, backoff hints and per-channel subscription.
   - Signed role tokens.
   - The `join`, `GET event` and `role-links` routes.
   - The time helper.
   - A module registration pattern, so WS1, WS2 and WS4 each add one folder.
4. **Worker core:** a job runner with an HTTP trigger endpoint (so traces propagate from app to worker), plus a periodic scheduler.
5. **Web shell:**
   - Vite, React and React Router.
   - Persona route groups `/a` (attendee), `/s` (speaker), `/o` (organizer), `/v` (vendor), `/venue`.
   - A join page, and the token stored in localStorage.
   - A typed API client and an SSE hook.
   - A dev role switcher.
   - The Dash0 RUM snippet, initialized from runtime config served by the API.
   - A temporary neutral theme using CSS variables, to be replaced by the design tokens.
6. Post "skeleton ready" to the orchestrator with how-to-add-a-module notes for other agents, in `docs/plan/HOWTO-modules.md`.

## WS1: Search and intelligence (Elasticsearch)
**Owns:** `apps/api/src/modules/search/`, `apps/worker/src/jobs/{seed,embed,cluster}/`, and `scripts/es/`.

**First 30 minutes (can start before WS0 finishes):**
- Verify Elastic Cloud connectivity and that the `semantic_text` default inference endpoint works.
- Create the `cnh-*` index mappings as an idempotent setup script, run by a worker job or an npm script.
- Get the seed data: try the real KubeCon schedule, otherwise generate the synthetic set described in 02-contracts section 9. Store it as JSON under `data/seed/`.

**Then deliver:**
1. Seed ingestion job for events, rooms, sessions, speakers and the CNH Demos event.
2. `GET /search`: hybrid retrieval (BM25 multi-match plus a semantic query, fused with RRF via retrievers), with filters for time, track and level, and highlights.
3. `POST /plan-my-day`: retrieve candidates by interests and time slots, then have the LLM pick a conflict-free plan with **cited session ids only**. Validate that the ids exist.
4. Question duplicate detection helper (used by WS2): a semantic top-1 search within the session. If the score is above the threshold, join that cluster; otherwise create a new cluster. Tune the threshold on 20 example pairs. A cluster-label job uses the LLM fast model.
5. Retrieval helpers: `lastTranscriptChunks(session, minutes)` and an `askConference` RAG over transcripts and questions with citations.
6. P1: `cnh-people` and booth matching helpers for WS7.

**Success:** "eBPF but for security folks" returns the right talks even though those words aren't in their titles. Two differently worded questions merge into one cluster.

## WS2: Live session backend and realtime
**Owns:** `apps/api/src/modules/live/` and `apps/worker/src/jobs/{catchup,digest,translate}/`.
1. Presence join and leave, updating Valkey counters and ES presence, then publishing `attendance.updated`.
2. `GET /sessions/:id/stream` (SSE): on connect, send a snapshot (last captions, open clusters, signal window, attendance), then live messages.
3. Transcript append, which writes to ES, publishes `caption.appended`, and records `conf.caption.lag_ms` using the client's utterance-end timestamp.
4. Questions: create (first a Jev moderation and intent decision via the shared `core` Jev wrapper, then WS1's duplicate helper), vote, and speaker answer/hide. Publish updates and record `conf.question.dedup`.
5. Signals: rate-limited, aggregated into 60-second windows, published, counted in `conf.signals`.
6. Catch-up: WS1 retrieval, then a worker LLM summary (fast model, 8 s budget), cached per session and minute.
7. P1: digest and on-demand translation (cached per chunk and language).

**Build v1 plainly and correctly**, then hand it to WS5 for the load test. Do not over-optimize before you have measurements.

## WS3: Attendee and speaker UI
**Owns:** `apps/web/src/personas/attendee/` and `apps/web/src/personas/speaker/`.

Mobile-first attendee app, plus a laptop speaker console. Use the design tokens and components from `apps/web/src/ui/` once the design session lands them (expected about 13:30). Until then, use the neutral theme and semantic HTML.

**Attendee:**
- Join flow from the QR.
- Home: now and next, plus my schedule.
- Search with results and "why this matched" highlights.
- Plan my day.
- Session live view:
  - large captions, auto-scrolling, with a pause-on-scroll-up affordance
  - an ask box showing "joined N others asking this"
  - question list with votes
  - signal buttons
  - a catch-me-up sheet
- Settings: text size, contrast, reduced motion, language, opt-in interests.
- Reroute suggestion toast and sheet.

**Speaker:**
- Session picker.
- **Start captions** button (Web Speech API: continuous, interim results shown locally, finals posted). It needs Chrome, so show a clear unsupported state and a typed live-notes fallback.
- Clusters ranked by votes and size, each with an answered toggle.
- Signal meter showing the last 60 seconds.
- Attendance count.
- A big-type stage mode.

**Success:** a judge scans the QR with no instructions and asks a question within 15 seconds.

## WS4: Organizer ops and conference telemetry
**Owns:** `apps/api/src/modules/ops/`, `apps/web/src/personas/organizer/`, and `apps/worker/src/jobs/{ops,sim}/`.
1. Domain metrics exporter: all `conf.*` metrics in 02-contracts section 6, computed from Valkey and ES state on a 10-second loop, plus event-driven counters.
2. Ops snapshot and stream: room grid (occupancy against capacity, the current session, signals, question volume), with alerts opened and resolved by rules:
   - occupancy ≥ 90% means overflow
   - a lost or louder signal spike over the threshold in 60 seconds
3. Reroute: for a full room, take the WS1 nearest sessions with seats now or soon, publish `reroute.suggested` to that room's attendees, and track accepted versus suggested.
4. Organizer UI: room grid as "services" (green, amber, red), an alert feed with the action button, ask-the-conference, deep links to the Dash0 dashboard, SLO and Agent0, and an event selector.
5. P2 (`jobs/sim`): crowd simulator for N virtual attendees moving between rooms, asking and signalling. Organizer toggle, always visibly labelled **SIMULATED**.

## WS5: Reliability, observability and Kubernetes (Dash0, Radar, Gitar evidence)
**Owns:** `deploy/`, `argocd/`, `.github/workflows/`, `scripts/load/`, and `docs/evidence/`. Runs on Claude with the **Radar MCP and Dash0 MCP**.
1. **First, at about 11:20:**
   - Apply the Argo CD Application via the Radar MCP.
   - Confirm the starter app is live at the team URL.
   - Screenshot the Radar **Checks** "before" state into `docs/evidence/`.
2. Manifests:
   - `app` Deployment (2 replicas) plus an HPA (CPU 60%, max 4).
   - `worker` Deployment, same image, `ROLE=worker`.
   - `valkey` Deployment and Service.
   - The `app-credentials` Secret referenced via `secretKeyRef`. **Create the Secret through the Radar MCP or kubectl with values from the orchestrator. Never commit it.**
   - Requests and limits within budget: 2 CPU / 4 GiB requests total.
3. Dash0: confirm traces, logs and metrics are arriving from app and worker, plus RUM from the web.
   - Build the **"Conference Ops" dashboard** (occupancy per room, signals, questions, caption lag, fanout latency, SSE clients, LLM tokens and cost).
   - Build two **SLOs**: question fanout p95 < 1 s, and room occupancy < 90%.
   - Export the dashboard definition to `docs/evidence/` if possible.
4. Load generator (`scripts/load/`): k6, or a Node script, simulating 300 attendees who join a session, hold SSE open, ask, vote and signal. Run it as a Kubernetes Job in the cluster (within budget) or from the laptop.
5. **Incident drills, 14:30 to 16:00.** These are real, not faked; see 06-demo.md.
   - Run the load test against v1.
   - Investigate with **Agent0** and the **Dash0 MCP**, and run a **Radar AI investigation** on what the cluster shows (throttling, OOM, restarts, HPA).
   - Get the fix done (by WS2 or yourself) and re-run.
   - Record every step with screenshots and links in `docs/evidence/INCIDENTS.md`.
6. P1: Argo Rollouts canary for `app` with an analysis on error rate.
7. **Gitar evidence:** keep a running `docs/evidence/GITAR.md` listing PR count, notable Gitar catches, and the CI failure that auto-apply fixed.

## WS6: Accessibility and i18n (Merge Forward)
**Owns:** `apps/web/src/ui/a11y/`, the i18n catalog, and fixes in other persona folders **by PR to the owner's area, with the orchestrator's approval**.
- Audit each persona view (keyboard, screen-reader names and landmarks, focus order, contrast, 200% text, reduced motion, colour not the only signal).
- Fix issues through small PRs.
- Captions view polish: font, line length, speaker change markers.
- Attendee language selector, wired to translation (P1).
- Write `docs/ACCESSIBILITY.md`, the Merge Forward story: who it serves and how. Judges read it.

## WS7: Vendor (P1). WS8: Venue (P2)
These follow the PRD descriptions. They own `modules/vendor`, `personas/vendor`, `modules/venue` and `personas/venue`. Consent first: vendors only see attendees who opted in. Every view is clearly secondary to P0. Stop at the orchestrator's cut signal.
