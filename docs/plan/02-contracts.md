# Contracts: the shared interfaces every workstream builds against

WS0 (Platform) turns this document into the shared TypeScript types package in the first hour. After that, **any change to a contract goes in the same PR as this file's update**, and Gitar enforces that.

## 1. Repo layout and folder ownership
| Path | Owner | Notes |
|---|---|---|
| `apps/api/src/core/` | WS0 | Server bootstrap, config, telemetry, ES client, Valkey bus, auth tokens |
| `apps/api/src/modules/search/` | WS1 | Search, RAG, seed ingestion |
| `apps/api/src/modules/live/` | WS2 | Sessions live: captions, questions, signals, SSE |
| `apps/api/src/modules/ops/` | WS4 | Rooms, occupancy, alerts, reroute, domain metrics |
| `apps/api/src/modules/vendor/` | WS7 | P1 |
| `apps/api/src/modules/venue/` | WS8 | P2 |
| `apps/worker/src/jobs/<name>/` | Same owner as the related module | One folder per job |
| `apps/web/src/app/` | WS0 | Shell, router, role switcher, API client core, design tokens hook-up |
| `apps/web/src/personas/attendee/` | WS3 | |
| `apps/web/src/personas/speaker/` | WS3 | |
| `apps/web/src/personas/organizer/` | WS4 | |
| `apps/web/src/personas/vendor/` and `venue/` | WS7 / WS8 | |
| `apps/web/src/ui/` | Design session, then WS6 | Shared components and tokens |
| `packages/contracts/` | WS0 (orchestrator approves edits) | Types for entities, API payloads, realtime messages, metric names |
| `deploy/`, `argocd/`, `.github/`, `Dockerfile` | WS5 | Starter conventions. Image name stays `app` |
| `docs/plan/`, `AGENTS.md`, `.gitar/` | Orchestrator | |

Build: a single Dockerfile builds the web app, then the API and worker, and produces one image. The `app` Deployment runs the API, which serves the SPA from `/`. The `worker` Deployment runs the same image with the worker entry command. Every app listens on `$PORT` (8080) and exposes `/healthz` and `/readyz`.

## 2. Domain model
All ids are opaque strings. All times are **UTC ISO-8601** in storage and transit, and all times are rendered in the event's IANA timezone (`America/Denver`) **only** through the shared time helper. **Field names are camelCase and identical in ES documents, `packages/contracts` types and API payloads**: e.g. `startsAt`, `endsAt`, `eventId`, `roomId`, `speakerIds`, `venueName`, `joinCode`, `capacity`, `floor`, `x`, `y`, `accessibility: { stepFree, hearingLoop, quiet }` (booleans). Events, rooms and speakers live in ES (`cnh-events`, `cnh-rooms`, `cnh-speakers`); the API caches them in memory (30 s TTL). Sessions are in `cnh-sessions`, because organizers add CNH Demos sessions live.

| Entity | Key fields | Notes |
|---|---|---|
| Event | id, name, timezone, venue name, starts at, ends at, join code | "kubecon-na-2026" and "cnh-demos" |
| Room | id, eventId, name, capacity, floor, x/y on the floor map, accessibility (step-free, hearing loop, quiet) | |
| Session | id, eventId, roomId, title, abstract, track, level, tags, speakerIds, starts at, ends at, status (scheduled, live, ended) | |
| Speaker | id, name, title, company, bio | Public speaker info only |
| Attendee | anonId, handle, interests (opt-in, free text), accessibility prefs, language | No PII ever. The handle is generated, e.g. "Teal Otter" |
| Presence | anonId, eventId, roomId or sessionId, kind (join, leave, checkin), at | Drives occupancy |
| TranscriptChunk | id, sessionId, seq, text, startedAt, endedAt, lang, source (speech, typed) | About 1 chunk per finalized utterance |
| Question | id, sessionId, anonId, text, clusterId, votes, status (open, answered, hidden), at | **Text never goes into logs, spans or metric labels** |
| QuestionCluster | id, sessionId, label (LLM short title), size, votes, representative question id | |
| Signal | sessionId, anonId, type (slower, louder, cant_see, lost, thumbs_up, too_cold, too_hot), at | Aggregated per 60s window |
| Alert | id, eventId, roomId, kind (overflow, signal_spike, facilities), severity, opened at, resolved at, action taken | |
| Recommendation | for an anonId: alternative sessionId, reason | Reroute output |
| Booth (P1) | id, eventId, vendor name, description, tags | |
| Match (P1) | anonId, boothId or anonId, score, consented flag | Only with consent |

## 3. Elasticsearch indices (Elastic Cloud, prefix `cnh-`)
Each index has a `semantic` field of type `semantic_text` where noted. **Source fields stay ordinary `text` fields with `copy_to: "semantic"`** (sessions: title, abstract, speakerNames; transcripts and questions: text; people: interests; booths: description), and every semantic query targets the field named `semantic`. Writers only index the plain fields, and embeddings are filled automatically. It uses the deployment's default inference endpoint, which WS1 verifies in the first 30 minutes. The fallback is a `dense_vector` field filled with OpenAI embeddings.

| Index | Mappings (described) | Queries it serves |
|---|---|---|
| `cnh-sessions` | text: title, abstract, speakerNames (denormalized), each copy_to semantic. keyword: eventId, roomId, track, level, tags, speakerIds, status. date: startsAt, endsAt. semantic_text: semantic | Hybrid search (BM25 plus semantic, fused with RRF), nearest-session for reroute, "build my day" RAG |
| `cnh-events` | keyword: id, joinCode, timezone. text: name, venueName. date: startsAt, endsAt | Event lookup by id or join code |
| `cnh-rooms` | keyword: id, eventId. text: name. integer: capacity, floor. float: x, y. boolean: accessibility.stepFree, accessibility.hearingLoop, accessibility.quiet | Room list per event, capacity for occupancy |
| `cnh-speakers` | keyword: id. text: name, title, company, bio | Speaker details for session pages |
| `cnh-transcripts` | keyword: sessionId, eventId, lang, source. integer: seq. date: startedAt, endedAt. text: text (copy_to semantic). semantic_text: semantic | Catch-me-up (last N minutes, by time), "ask the conference" RAG across sessions |
| `cnh-questions` | keyword: sessionId, eventId, anonId, clusterId, status. integer: votes. date: at. text: text (copy_to semantic). semantic_text: semantic | Duplicate detection (top-1 semantic similarity within the session above a threshold, so it joins that cluster), clustering, digest |
| `cnh-signals` | keyword: sessionId, roomId, eventId, type, anonId. date: at | Aggregations by type over time windows |
| `cnh-presence` | keyword: eventId, roomId, sessionId, anonId, kind. date: at | Occupancy aggregations (latest state per anonId) |
| `cnh-people` *(P1)* | keyword: anonId, eventId. text: interests (copy_to semantic). semantic_text: semantic | Hallway and vendor matching |
| `cnh-booths` *(P1)* | text: description (copy_to semantic). semantic_text: semantic | Vendor matching |

Live counters (occupancy, votes) are **also** kept in Valkey for speed. ES remains the record and the analytics layer.

## 4. API surface (all under `/api`, JSON)
Roles are carried by a signed token: attendee (issued on join), or speaker, organizer, vendor or venue (role links). The token travels in the `Authorization` header (`Bearer`). SSE routes take it the same way: the web client opens streams with `fetch` plus the `Authorization` header and reads the streamed body (not `EventSource`), so **tokens never appear in URLs**. As a backstop, WS0 redacts any `token` query parameter from span attributes (`url.query`, `http.target`, `url.full`), RUM URLs and request logs, and never logs the `Authorization` header.

**First organizer token (bootstrap):** there is no public route that mints an organizer token. `npm run mint-link -- --role organizer --event <eventId>` (WS0, `apps/api/src/core/`) signs one locally with `TOKEN_SIGNING_KEY` from `.env` and prints the full join link. From then on the organizer uses `POST /events/:eventId/role-links` to mint speaker, vendor and venue links. **Every role link carries its token in the URL fragment** (`/join#t=<token>`), which browsers never send to the server; the SPA saves it to localStorage and immediately strips it with `history.replaceState` before RUM records the page URL.

| Method and path | Role | Purpose | Owner |
|---|---|---|---|
| POST `/events/:eventId/join` | public | Join by code. Returns an anonId, handle and attendee token | WS0 |
| GET `/events/:eventId` | any | Event, rooms, now and next | WS0 |
| POST `/events/:eventId/role-links` | organizer | Mint speaker, vendor and venue links | WS0 |
| GET `/config` | public | Runtime config for the SPA: version, event timezone, Dash0 RUM settings (public values only) | WS0 |
| GET `/sessions/:id` | any | Session snapshot (session, questions, clusters, attendance), refetched after an SSE reconnect | WS2 |
| GET `/events/:eventId/search?q=&track=&level=&from=&to=` | any | Hybrid session search; optional exact track/level filters and UTC overlap window `[from,to)`, limit 1–50 | WS1 |
| POST `/events/:eventId/plan-my-day` | attendee | RAG schedule suggestion with cited session ids | WS1 |
| POST `/events/:eventId/ask` | organizer (attendee in P1) | Ask the conference (RAG over transcripts and questions) | WS1 |
| GET and PUT `/me/schedule` | attendee | My schedule | WS3 |
| PUT `/me/prefs` | attendee | Accessibility prefs, language, interests (opt-in) | WS3 |
| POST `/sessions/:id/presence` | attendee | Join or leave session (drives occupancy) | WS2 |
| GET `/sessions/:id/stream` | any | SSE stream of realtime messages for the session | WS2 |
| POST `/sessions/:id/transcript` | speaker | Append a caption chunk | WS2 |
| POST `/sessions/:id/questions` | attendee | Ask. Returns the cluster it joined | WS2 |
| POST `/questions/:id/vote` | attendee | Upvote | WS2 |
| PATCH `/questions/:id` | speaker | Mark answered or hidden | WS2 |
| POST `/sessions/:id/signals` | attendee | Send a signal (rate-limited, 1 per type per 30s per anonId) | WS2 |
| POST `/sessions/:id/catch-up` | attendee | Summary of the last N minutes | WS2 (calls a WS1 retrieval helper) |
| GET `/sessions/:id/digest` | speaker | P1 post-talk digest | WS2 |
| GET `/events/:eventId/ops` | organizer | Room grid snapshot | WS4 |
| GET `/events/:eventId/ops/stream` | organizer | SSE ops stream | WS4 |
| GET `/events/:eventId/ops/simulation` | organizer | Read `SimulationStatus`; CNH Demos only | WS4 |
| POST `/events/:eventId/ops/simulation` | organizer | `SimulationControlRequest` `{ running, attendees? }`; start or stop a SIMULATED crowd of 1–200 attendees (default 40) | WS4 |
| POST `/events/:eventId/alerts/:id/reroute` | organizer | Push alternatives to attendees of a full room | WS4 |
| POST `/events/:eventId/reroute/accept` | attendee | Body `{ suggestionId }`; idempotently count acceptance, return `{ accepted, sessionId }`. Client then joins via the normal presence route | WS4 |
| GET `/events/:eventId/rooms/:roomId/history` | organizer | Occupancy and signal series | WS4 |
| `/vendor/*`, `/venue/*` | vendor / venue | P1 / P2 | WS7 / WS8 |

Errors use a JSON body with `error.code` and `error.message`. Every route validates input with the shared schema library chosen by WS0: **zod 4**. `packages/contracts` exports a zod schema and a TypeScript type with the same name for every entity, request and response (`JoinRequest`, `JoinResponse`, `EventView`, `SessionSnapshot`, ...), so the exact field names live there.

The ops snapshot's `RoomStatus` includes optional `questionCount` (a nonnegative integer). Reroute recommendations include optional `suggestionId` for the acceptance route; WS4 always supplies it on new suggestions.

The P2 crowd simulator is visibly labelled **SIMULATED**, is restricted to `cnh-demos`, and requires concurrent Main Stage and Side Stage sessions. `SimulationStatus` contains `{ simulated: true, running, stopping, attendees, startedAt?, endsAt? }` with UTC timestamps. Only one run may exist at a time. New simulated activity stops after at most ten minutes; `stopping` remains true while normal presence-leave calls remove the simulated attendees. A new run is refused until cleanup completes. All simulated presence, questions and signals use the normal attendee handlers and their metrics; the simulator does not write WS2's live-state keys directly.

## 5. Realtime messages (SSE, fanned out via Valkey channels)
Channels: `session:<id>`, `ops:<eventId>`, `user:<anonId>`. Each message has `type`, `at` and a `payload` (`RealtimeMessage` in `packages/contracts`; build one with `realtime(type, payload)`). Payload ids are named `chunkId`, `questionId`, `clusterId`, `sessionId`, `roomId`.

**User channel delivery:** there is no separate user stream. Every authenticated SSE stream (`/sessions/:id/stream` and `/events/:eventId/ops/stream`) also subscribes to the caller's `user:<anonId>` channel, taken from the token, and multiplexes those messages into the same connection. Reroute suggestions therefore reach attendees through the session stream they already hold open.

| Type | Channel | Payload (described) |
|---|---|---|
| `caption.appended` | session | chunk id, seq, text, lang |
| `question.created` / `question.updated` | session | question id, clusterId, votes, status. Text is included on session channels only |
| `cluster.updated` | session | cluster id, label, size, votes |
| `signals.window` | session, ops | counts per type for the last 60 seconds |
| `attendance.updated` | session, ops | session id, room id, count, capacity |
| `alert.opened` / `alert.resolved` | ops | alert |
| `reroute.suggested` | user | recommendation |
| `session.status` | session, ops | live or ended |

The client reconnects with exponential backoff and refetches the snapshot after reconnecting.

### Valkey live-state keys

WS2 writes live state; WS4 reads it through the core `ctx.kv` client (500 ms timeout and ioredis spans):

- `room:{roomId}:members` SET of anonId; occupancy = SCARD.
- `session:{sessionId}:members` SET of anonId; session attendees = SCARD.
- `attendee:{anonId}:at` HASH `{eventId, roomId, sessionId, at}`. Reroute targets = SMEMBERS of the full room's members.
- `signals:{sessionId}:{type}` ZSET, score = epoch ms, member = unique id, trimmed at >120 s; rolling 60 s = ZCOUNT from now-60000 to +inf.
- `questions:{sessionId}:count` INT.
- WS2 treats an SSE disconnect as leave after a 30 s grace.
- WS4 stores suggestions as `reroute:{suggestionId}` HASH `{anonId, alertId, fromRoomId, toSessionId}`, TTL 15 min.
- WS4 owns `ops:cnh-demos:simulation` (bounded run metadata retained until cleanup), its `:lease` (20-second elected runner lease), and `:stop:{runId}` (24-hour stop request). These keys contain no tokens. Persisted actor IDs use a `sim_` prefix and are never metric labels or logged.

The ops rules open an overflow alert at occupancy ≥90%, and a signal-spike alert at ≥5 `lost` or `louder` signals within the rolling 60-second window. Acceptance increments `conf.reroute.accepted` once per suggestion; normal presence handles the subsequent session move.

## 6. Observability conventions (Dash0)
- **Service names:** `lanyard-app`, `lanyard-worker`, `lanyard-web` (RUM). Resource attributes: `deployment.environment=hackathon` and `service.version=<git sha>`.
- **Export:** OTLP over gRPC or HTTP to the Dash0 ingress endpoint from Settings → Endpoints, with header `Authorization: Bearer <token>`. Config lives only in env vars from the `app-credentials` Secret.
- **Traces:**
  - Auto-instrument http, fastify, undici/fetch and ioredis.
  - Wrap the ES client and the LLM client in spans: `es.<index>.<op>`, and `llm.<purpose>` via OpenLIT, which records model, tokens and cost.
  - Propagate W3C trace context from the browser (RUM), through `app`, to `worker`.
- **Logs:** structured JSON (pino) with trace id and span id, exported via OTLP. Never log question text, caption text or prefs.
- **Domain metrics** (OTel metrics, exported from `app` and `worker`):

| Metric | Type | Attributes | Used for |
|---|---|---|---|
| `conf.room.occupancy` | gauge | event, room | Ops board. SLO: occupancy / capacity < 0.9 |
| `conf.room.capacity` | gauge | event, room | Ratio denominator |
| `conf.session.attendees` | gauge | event, session, room | |
| `conf.signals` | counter | event, room, type | Sentiment and comfort |
| `conf.questions` | counter | event, session | Engagement |
| `conf.question.dedup` | counter | event, merged (true/false) | Shows ES doing real work |
| `conf.reroute.suggested` / `conf.reroute.accepted` | counter | event, room | Outcome of the ops action |
| `conf.caption.lag_ms` | histogram | event, session | Accessibility SLO: p95 < 1500 ms |
| `conf.realtime.fanout_ms` | histogram | channel kind | Product SLO: question visible to the speaker, p95 < 1000 ms |
| `conf.sse.clients` | gauge | channel kind | Load evidence during the demo |

**Cardinality rule:** attributes may be event, room, session, type or channel kind. Never anonId, never text.

## 7. Configuration (env vars; the secret ones come from the `app-credentials` Secret)
`PORT`, `ROLE` (app or worker), `PUBLIC_BASE_URL`, `EVENT_TZ`, `ES_URL`*, `ES_API_KEY`*, `VALKEY_URL`, `OPENAI_API_KEY`*, `TYPESAFE_API_KEY`*, `LLM_MODEL_CHAT`, `LLM_MODEL_FAST`, `OTEL_EXPORTER_OTLP_ENDPOINT`*, `OTEL_EXPORTER_OTLP_HEADERS`*, `OTEL_SERVICE_NAME`, `DASH0_RUM_AUTH_TOKEN`*, `DASH0_RUM_ENDPOINT`, `TOKEN_SIGNING_KEY`*.

\* means a secret. It is never committed and goes only into `.env` locally (gitignored) and into the Kubernetes Secret.

## 8. Reliability conventions (also Gitar review rules)
- Every outbound call has an explicit timeout: ES 2 s, LLM 20 s (catch-up 8 s), Valkey 500 ms. Each has a span, and errors are recorded on the span.
- LLM calls happen only in `worker` or behind a cache. API routes never block more than 8 s.
- Catch-me-up retrieves the last N transcript chunks from ES. It never sends a whole transcript to the LLM.
- Resource requests and limits are set on every container and stay within budget.

## 9. Seed data
1. Try the real KubeCon NA 2026 schedule (the public schedule site; plain `curl` was blocked, so use a browser fetch), keeping only public talk data.
2. Fallback: an LLM generates about 120 sessions across 10 rooms with realistic tracks (Platform Engineering, Security, AI/Inference, Observability, eBPF, GitOps). Speakers are fictional.
3. The "CNH Demos" event has two rooms: "Main Stage" (small capacity, about 30, so it overflows during the demo), with a session per team added live by the organizer, and "Side Stage" (capacity about 100), with a concurrent "Hallway Track: open Q&A" session that is the reroute destination.
4. Room capacities are chosen so that one room plausibly overflows during the demo.
