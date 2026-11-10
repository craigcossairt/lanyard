# AI usage disclosure

Lanyard was built solo by Craig Cossairt at the Cloud Native Hackathon (Salt Lake City, 2026-11-09). Craig orchestrated about 12 AI coding agents in parallel through T3 Code. Craig chose the product, scope and architecture, made the product and priority calls listed below, and supervised every merge through the orchestrator. All code was written after hacking began at 11:00 MT.

## How the work was organised

- **One orchestrator** (Claude Hub / claude-opus-5-5) owned planning, contracts, scope cuts, gate scoring and **all merges**. No agent merged its own work and nothing was pushed straight to `main`; the only direct commits are the deploy bot's `deploy: <sha> [skip ci]` commits.
- **Each workstream agent** worked in its own git worktree, owned specific folders (`docs/plan/02-contracts.md` §1), and shipped small PRs.
- **Every PR passed CI and a Gitar review** before merging. Each Gitar comment was fixed, or answered with a reason. See `docs/evidence/GITAR.md`.
- **Contracts first:** shared types in `packages/contracts` and `docs/plan/02-contracts.md` changed only through small, orchestrator-approved PRs.

## Who built what

| Area | Workstream | Harness / model |
|---|---|---|
| Planning package (`docs/plan/`) | pre-event planning | Claude Hub / claude-opus-5-5 (with Craig) |
| Repo setup, agent conventions, Gitar config, CI | setup + orchestrator | Claude Hub / claude-opus-5-5 |
| Orchestration, contracts, merges, gate scoring, this file | orchestrator | Claude Hub / claude-opus-5-5 |
| Monorepo, OpenTelemetry bootstrap, API core, tokens, SSE + Valkey bus, `llm()` + worker jobs, web shell, SSE rotation for the platform's 15 s cap | WS0 platform | Claude Hub / claude-opus-5-5 |
| Elasticsearch indices, real KubeCon seed, hybrid RRF search, dedup calibration, plan-my-day, ask-the-conference, demo question wording | WS1 search | Codex / gpt-6.1-sol |
| Live sessions: SSE stream, captions, presence, questions + clusters + labels, signals, catch-up, demo cleanup/reset | WS2 live backend | Claude Hub / claude-opus-5-5 |
| Attendee app and speaker console UI | WS3 attendee/speaker UI | Claude / claude-fable-5-1 |
| Ops board, conference metrics, alerts, reroute, SIMULATED demo scenario | WS4 organizer ops | Codex / gpt-6-astra |
| Kubernetes manifests, Argo CD, Valkey, HPA, PDB, startup probes, Dash0 dashboard + SLOs, load tests, incident evidence | WS5 reliability | Claude Hub / claude-opus-5-5 |
| Accessibility, caption readability, i18n, `ACCESSIBILITY.md` | WS6 accessibility | Cursor / grok-4.7 |
| Opt-in networking matcher ("Meet people") | WS7 networking | Codex / gpt-6-luna |
| Design system (tokens + components, direction "Caption stage") | Craig's design session | Claude (T3 design thread) |
| Design-system completion, landing page, join QR, app bar, friendly errors, README | WS9 UX lead | Claude Hub / claude-opus-5-5 |
| Demo QA passes and the video script | WS10 demo QA | Claude / claude-sonnet-5-5 |
| Caption translation to Spanish (built, not merged in time) | WS11 translation | Cursor / composer-2.5 |

Every PR description records the exact harness and model ("AI usage: …").

## AI inside the product

| Feature | Model / service | Why |
|---|---|---|
| Semantic search, question dedup, people matching | Elasticsearch `semantic_text` (default inference endpoint `.jina-embeddings-v5-text-small`) | Find "eBPF but for security folks" without keyword overlap, and merge paraphrased questions |
| Plan my day, ask the conference | OpenAI `gpt-6.1-sol` (`LLM_MODEL_CHAT`), behind a cache with ≤ 8 s API budgets | RAG answers that cite only real session and question ids (validated server-side) |
| Catch-me-up summaries, cluster labels, match reasons | OpenAI `gpt-5.4-mini` (`LLM_MODEL_FAST`), in the worker | Fast, cheap summaries and short labels |
| Question moderation and intent | Jev (`@typesafe-ai/sdk`) with an OpenAI moderation fallback | Keep anonymous Q&A safe without blocking the speaker |
| Live captions | The browser's Web Speech API | No keys, no cost, works on the podium laptop in Chrome |
| SRE investigations | Dash0 Agent0 and Radar Cloud AI investigations | Real incidents: probe noise after rollouts, the platform's 15 s stream cut, and the load-drill crash loop |

Telemetry follows the privacy rules in `docs/plan/02-contracts.md` §6–8: no question text, caption text, search queries, preferences or LinkedIn URLs in logs, spans or metric labels.

## Craig's decisions

- **Product and pitch:** "a conference is a distributed system": rooms are services, attendees are traffic. P0 personas: attendee, speaker, organizer.
- **Stack:** one image (api/worker roles) on the team's Kubernetes vcluster via Argo CD, with Elasticsearch as the only database, Valkey for live state, and Dash0 for OpenTelemetry.
- **Removed CodeRabbit** so Gitar is the single review agent.
- **Recorded-video submission:** once judging was confirmed to use a 3-minute recorded video, Craig made the SIMULATED demo scenario the demo engine, kept real microphone captions working, and chose a product-focused video (the form covers the tools).
- **"Do everything" at 15:00:** Craig added a UX lead, a demo QA lead, Spanish captions, and an opt-in networking matcher ("a localized Boardy": LinkedIn URL plus who-to-meet, matched with Elasticsearch, consent-first, no scraping).
- **Scope cuts per the PRD ladder:** the venue view was cut at G2; vendor booth matching was dropped at G3; Spanish captions missed the 16:15 P1 deadline and stayed unmerged.
- **Pre-approved** Radar AI investigations, and approved signing the rehearsal browser in with a locally minted organizer link.

## Orchestrator decisions worth knowing

- **Contract decisions during the build:**
  - the organizer bootstrap via the `mint-link` CLI;
  - **no tokens in URLs** (fetch-streamed SSE plus URL-fragment role links, after a Gitar security finding);
  - camelCase field names;
  - `copy_to: "semantic"`;
  - the Valkey live-state key schema;
  - an 8 s budget for every API route, with one documented 4 s exception for the semantic dedup query on the trial inference endpoint.
- **Process fixes after mistakes:**
  - stacked PRs are now merged without deleting their base branches until dependents are retargeted (after `--delete-branch` auto-closed #17, #38 and #40, all recovered);
  - load drills never run concurrently with the demo scenario (after incident A).
