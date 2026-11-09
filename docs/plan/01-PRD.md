# PRD: Lanyard, the conference platform

> Working codename until the name is chosen: **Lanyard**. Replace it everywhere at repo setup (11:00).
> Event: Cloud Native Hackathon, Mon 2026-11-09, Salt Lake City. Hacking runs 11:00 to 17:30 MT, demos 17:30.

## Tagline
**Conferences, observable.**

## One-liner
**One live event graph, a tailored view for every person in the building, and the conference itself instrumented like a production system.**

## The insight (lead the pitch with this)
A conference is a distributed system:
- Rooms are services.
- Attendees are traffic.
- A full room is a saturation incident.
- A confused audience is an error budget burning.

Conference organizers run that system blind. We instrument it with OpenTelemetry, the same way cloud native teams instrument production:
- Every check-in, question and "can't hear" signal becomes telemetry.
- Organizers get SLOs, alerts and an AI SRE (Dash0 Agent0) for the event itself.
- Every other persona gets a product built on the same live graph.

## Personas and jobs-to-be-done
| Persona | Device | Job | What they get |
|---|---|---|---|
| **Attendee** | Phone (QR, no install, no account) | Find the right talks, follow along, be heard | Semantic talk search and AI schedule builder. Live session mode: captions, anonymous Q&A, signals, "catch me up". Accessibility settings that follow them |
| **Speaker** | Laptop on the podium | Know the room in real time and answer what matters | Speaker console: one-click live captions from the mic, merged question clusters, pacing signals, live attendance. Post-talk digest |
| **Organizer** | Laptop, big screen | Keep the event healthy | Ops board with rooms as services: occupancy SLOs, overflow alerts with one-click reroute, sentiment and engagement, conference-wide search and Q&A over every transcript, links into Dash0 |
| **Vendor** *(P1)* | Tablet at the booth | Meet the right people without creepy lead scanning | Booth profile, opt-in interest matches, booth traffic |
| **Venue** *(P2)* | Ops phone or desk | Flow, comfort and access | Crowd heatmap, facilities reports ("Room C too cold" ×12), step-free and quiet routes |

"Inclusion by default" applies to every surface. It is also the Merge Forward pitch:
- Live captions, with translation as P1.
- Anonymous questions for people who won't raise a hand.
- Sensory signals and quiet-room awareness.
- "Catch me up" for anyone who stepped out (caregivers, prayer, sensory breaks, a call).
- Large text, high contrast, reduced motion, screen-reader-first markup.

## Scope tiers
**P0 is the demo.** P1 and P2 are only built while P0 is green on the deployed URL.

### P0: core (must be live on `https://<team>.cnh.radarhq.io` by 15:30)
1. **Event graph and seed data:**
   - Load an event: rooms, sessions, speakers, abstracts. Use the real KubeCon NA 2026 schedule if it can be fetched, otherwise a realistic synthetic set of about 120 sessions.
   - Add a second event, **"CNH Demos"**, used live at 17:30.
2. **Join and roles:**
   - Scanning the event QR gives an anonymous attendee identity (random friendly handle). No accounts.
   - Role links (signed tokens) for speaker, organizer, vendor and venue.
3. **Attendee: Find:**
   - Hybrid search (BM25 plus semantic) over sessions, e.g. "eBPF but for security folks".
   - "Build my day": a RAG answer that cites sessions, plus one-tap add to My Schedule.
4. **Attendee: Live session:**
   - Live captions stream.
   - Ask a question anonymously, with near-duplicate merging and upvotes.
   - Signals: slower / louder / can't see slides / lost me / 👍.
   - "Catch me up on the last 10 minutes."
5. **Speaker console:**
   - Start captions (browser speech recognition, so no keys and no cost).
   - Question clusters ranked by votes and size.
   - Signal meter, live attendance, an "answered" toggle.
6. **Organizer ops board:**
   - Room grid with occupancy against capacity (SLO: under 90%), live signals, question volume.
   - Overflow alert, plus one-click reroute that pushes "Room B is full; the closest talk with seats is …" to affected attendees, using semantic nearest neighbour.
   - Event-wide "Ask the conference" over all transcripts and questions.
   - Deep links to the Dash0 dashboard and SLO.
7. **Conference telemetry:** domain metrics emitted as OpenTelemetry metrics to Dash0. Dashboard plus at least one SLO built in Dash0.
8. **Accessibility baseline:** text-size and contrast settings, captions view, reduced motion, landmarks and labels, keyboard-complete speaker and organizer consoles.
9. **Platform proof:**
   - Every feature merged via a Gitar-reviewed PR.
   - Dash0 traces, logs, metrics and RUM.
   - Running on the Radar vcluster through Argo CD.
   - At least one Radar AI investigation and one Agent0 investigation of a real issue.

### P1: stretch 1 (after P0 is green and deployed)
- Vendor view: booth profiles, opt-in "people who'd like this booth" matches, a booth-visit counter.
- Caption translation (on demand per language, cached per chunk).
- Post-talk speaker digest: unanswered clusters, signal timeline, summary.
- Hallway matchmaker: opt-in interest embeddings, "3 people here share your interests", meet at a named spot.
- Argo Rollouts canary for the app, with an analysis template.

### P2: stretch 2
- Venue view: floor map heatmap from presence, facilities reports, step-free and quiet routes.
- Organizer simulation switch: a synthetic crowd generator, always labelled as simulated in the UI.
- Synthetic monitoring in Dash0 on the join flow.
- Offer the organizers our QR for the entire CNH demo session.

## Non-goals (do not build)
- Real auth, SSO, payments, ticketing, or native apps.
- Indoor positioning hardware. Presence comes only from explicit check-ins and joins.
- Storing PII. There are no emails or names for attendees, only anonymous ids and handles.

## Architecture (decided tonight; see 02-contracts.md for details)
**One repo and one container image**, built by the starter's pipeline, run as several Deployments in the Radar vcluster:

| Deployment | Role |
|---|---|
| `app` | API, server-sent events (SSE) realtime, and the built web SPA. Autoscaled by an HPA. This is the starter's `app` Service, so the HTTPRoute works unchanged |
| `worker` | Same image with a different command. Runs LLM jobs (summaries, catch-up, translation), question clustering, seed ingestion and the crowd simulator, so traces span services |
| `valkey` | Pub/sub fan-out for realtime across `app` replicas |

External services:
- **Elastic Cloud** (trial) is the system of record for every searchable entity and the core data layer. It is kept out of the 4 GiB vcluster budget.
- **OpenAI** (event credits) for chat and summary models, instrumented with OpenLIT for token and cost traces.
- **Jev (TypeSafe AI)** is a "System One" decision model: it returns typed choices with calibrated probabilities and no prose, in roughly 70–500 ms. Use it for **fast decisions in the request path**: moderating anonymous questions (allow, hide or review), question intent (clarification, deep-dive, off-topic), alert severity, and facilities-report triage. Calls go through the TypeScript SDK `@typesafe-ai/sdk`, wrapped in a `jev.<decision>` span that records the chosen label and its probability as attributes, never the text. If Jev is down, fall back to OpenAI moderation. This reserves the LLM for generating text and gives every judgement a typed, cheap, observable decision.
- **Dash0** for OpenTelemetry traces, metrics and logs, plus RUM via its web SDK.

Stack:
- TypeScript everywhere, with npm workspaces.
- API: Fastify.
- Web: Vite, React and React Router.
- ES access: `@elastic/elasticsearch`.
- Instrumentation: OpenTelemetry Node SDK auto-instrumentation.

## Track mapping (what each judge must see)
| Track | Evidence we will show |
|---|---|
| Elasticsearch | ES is the only store for sessions, transcripts, questions and signals. Uses `semantic_text`, hybrid retrieval (RRF), and kNN duplicate detection for questions. RAG serves both "build my day" and "ask the conference" |
| Dash0 | Instrumentation from the first PR. RUM on phones, GenAI traces with token cost, conference domain metrics, a dashboard and SLO, and an Agent0 investigation of the load-test regression with the fix PR linked |
| Radar | The app runs on the vcluster via Argo CD, with HPA scale-out visible during the room demo. Radar MCP is used by the agents to ship. A Radar AI investigation drives a real decision (see 06-demo.md). Checks screenshots before and after |
| Gitar | PR count from a swarm of agents, all Gitar-gated. Custom `.gitar/review` and `.gitar/rules` encode our observability, privacy, timezone, contracts and accessibility conventions. A CI failure diagnosed and fixed by auto-apply |
| Merge Forward | Inclusion is the product, not a feature list: captions, anonymous participation, sensory signals, catch-up, accessibility settings |
| Grand prize | The live room demo, where judges become attendees, plus "the conference as a production system" |

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Venue Wi-Fi fails during the demo | Phones use cellular. The laptop hotspots from a phone. A backup video is recorded at 16:45 |
| Browser speech recognition is unavailable (needs Chrome or Edge) | The speaker console runs in Chrome. Fallback is typed "live notes" in the same caption pipeline |
| Merge conflicts across about 8 parallel agents | Each workstream owns its folders (03-workstreams.md). Contracts are frozen first. Shared files are changed only by WS0 or the orchestrator |
| Gitar review latency (minutes per PR) | Small PRs. Agents keep working on the next slice while waiting. The orchestrator merges serially |
| ES `semantic_text` inference endpoint not ready on the trial | Check this in the first 30 minutes. Fallback: OpenAI embeddings into a `dense_vector` field, with the same query shape |
| Vcluster budget (2 CPU / 4 GiB requests total) | Requests: app 2×(200m/256Mi) with HPA up to 4; worker 1×(200m/384Mi); valkey 50m/64Mi |
| Scope sprawl | The scope-cut ladder below, enforced at 13:30, 15:30 and 16:30 |

## Scope-cut ladder (cut from the top first)
1. Venue view (P2)
2. Simulation switch (P2): the room demo is enough
3. Hallway matchmaker (P1)
4. Vendor view (P1)
5. Translation (P1). Keep captions
6. Canary rollouts (P1). Keep the HPA

**Never cut:** live session, speaker console, ops board, Gitar flow, Dash0 instrumentation, and running on Radar.
