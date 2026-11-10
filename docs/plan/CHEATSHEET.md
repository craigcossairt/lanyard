# Lanyard cheat sheet (one page, for talking to judges)

**Pitch:** "A conference is a distributed system. Rooms are services, attendees are traffic, a full room is a saturation incident, and a confused audience is an error budget burning. Lanyard instruments the conference like production, and gives every person in the building a tailored view of the same live event graph."

## What it does (one line per persona)
- **Attendee (phone, no account):** scan the QR → semantic talk search ("eBPF but for security folks") → plan my day (cited, conflict-free) → live session: captions, anonymous questions that merge with similar ones, signals ("louder", "slower", "lost me"), catch me up → reroute suggestions when a room is full → opt-in "Meet people" networking.
- **Speaker (laptop):** start captions from the mic (Web Speech API), question clusters ranked by votes and size, signal meter, attendance.
- **Organizer (big screen):** rooms as services (green, amber, red), overflow and signal-spike alerts, one-click **Reroute** to the nearest session with seats, ask-the-conference with citations, links to the Dash0 dashboard and SLOs.

## How it works (30 seconds)
- **One image, two roles** on our Kubernetes vcluster via **Argo CD** (GitOps): `app` (Fastify API + SPA + SSE streams, HPA 2→4, PDB, startup probes) and `worker` (LLM jobs: catch-up, cluster labels, plan/ask generation). **Valkey** holds live state and pub/sub.
- **Elasticsearch is the only database:** sessions, transcripts, questions, signals, presence, people. Hybrid search = BM25 + `semantic_text` fused with **RRF**. Question dedup = top-1 semantic match within the session above a calibrated threshold (0.848, zero false merges on 20 hard pairs).
- **Realtime:** fetch-based SSE (tokens never in URLs). The platform gateway cuts streams at exactly 15 s, so the server rotates every ~12 s and the client resumes from a fresh snapshot, invisibly.
- **LLMs only in the worker or behind a cache**, every API route ≤ 8 s. RAG answers may cite only session and question ids that exist (validated server-side).
- **Observability built in from the first platform PR:** OpenTelemetry traces, logs and metrics from app and worker, RUM from the browser, conference domain metrics (`conf.room.occupancy`, `conf.question.dedup`, `conf.reroute.*`, `conf.realtime.fanout_ms`…), a Conference Ops dashboard and 2 SLOs in **Dash0**.

## Real incidents we found and fixed (great judge questions)
1. **Probe noise on rollout** → a Radar AI investigation → added `startupProbe` → readiness/liveness failures per rollout went from 1–3 to 0.
2. **SSE streams dying every 15 s** → Dash0 span durations showed exactly 15.000 s ± 0.011 s at the gateway → server-side rotation plus resume.
3. **Load drill:** 300 virtual attendees plus the demo crowd → liveness timeouts crash-looped `app`, and the Elastic trial embedding model rate-limited (429) → a Radar investigation plus Agent0; lessons: probe timeouts, never run load with the demo, and the trial rate limits.

## Sponsor tools at a glance
- **Gitar:** reviewed every PR (~80); custom rules for budget, contracts, privacy, time, a11y and observability; an auto-fix commit landed. Evidence: `docs/evidence/GITAR.md`.
- **Dash0:** OTel everywhere, domain metrics, a dashboard, 2 SLOs, Agent0 on incidents. `docs/evidence/INCIDENTS.md`.
- **Radar:** Argo CD GitOps; Checks before → after (88.5% → 90.5% passing); AI investigations → concrete changes. `docs/evidence/RADAR.md`.
- **Elastic:** the core data layer, hybrid RRF, semantic dedup, RAG with verified citations. `docs/evidence/ELASTIC.md`.
- **Merge Forward:** live captions, anonymous questions, sensory signals, catch-me-up, large text, contrast, reduced motion. `docs/ACCESSIBILITY.md`.

## Honest limits
- The demo crowd is **SIMULATED** (labelled on screen) and runs only on the CNH Demos event.
- The Elastic **trial** embedding endpoint is rate-limited under heavy load.
- Spanish caption translation and the full i18n UI were built but not merged before the freeze.
- The speaker console's caption preview pane doesn't yet mirror server-side captions (attendee phones do).

## How AI built it
One builder (Craig) plus one orchestrator agent plus ~11 workstream agents across Claude, Codex and Cursor, each in its own worktree, with small PRs, Gitar review on every PR, and serial merges by the orchestrator. Details: `docs/AI_USAGE.md`.
