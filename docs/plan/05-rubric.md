# Theoretical judging rubric (score at G2 13:30, G3 15:30, G4 16:30)

Each criterion is scored from 1 to 5, and "5 looks like" is the bar. **Evidence** is the artifact a judge can see in under 30 seconds: a demo moment, screenshot, link or README section. If there's no evidence, it scores 1.

The sponsor-track criteria are taken from the published track briefs. The grand-prize weights are our inference, since no official overall rubric is published.

## A. Grand prize / best overall (weights are our estimate)
| # | Criterion | Weight | 5 looks like | Evidence |
|---|---|---|---|---|
| A1 | Makes conferences easier (theme) | 25 | Every persona in the room has a reason to use it today. The judges *were* attendees in the demo | The live room demo |
| A2 | Originality | 15 | A framing nobody else has ("the conference as a production system"), not a mash-up of the sample ideas | Pitch opening, ops board |
| A3 | Technical depth | 20 | Distributed realtime on Kubernetes, hybrid/semantic search, RAG with citations, and telemetry from browser to worker, all working live | Architecture slide, a Dash0 trace |
| A4 | Use of sponsor tools (breadth × depth) | 20 | All four tools are load-bearing, not bolted on | Track sections below |
| A5 | Demo quality and polish | 20 | Under 3 minutes, no dead air, works on judges' phones, a clear story arc, a design that looks shipped | Rehearsal timing, design session output |

## B. Track 1: Sonar / Gitar ("Never Merge Broken")
| # | Criterion (published) | 5 looks like | Evidence |
|---|---|---|---|
| B1 | Gitar used throughout, with features merged via reviewed PRs | 40+ PRs from about 8 agents, 100% Gitar-reviewed, none pushed straight to main (except deploy bot commits) | PR list, `docs/evidence/GITAR.md` |
| B2 | Setup fits the project | `.gitar/review/*` encodes *our* conventions (OTel spans, privacy, UTC, contracts, a11y, budget). `.gitar/rules/*` enforces "API change ⇒ client and contracts updated" | The files, plus 2–3 PRs where a rule fired |
| B3 | CI failure analysis and auto-apply fix real problems | At least one real CI break diagnosed and fixed by an auto-apply commit | PR link and screenshot |
| B4 | Makes conferences easier | Shared with A1 | |

## C. Track 2: Dash0 ("Stop Flying Blind")
| # | Criterion | 5 looks like | Evidence |
|---|---|---|---|
| C1 | Instrumentation depth | Traces, logs and metrics from app and worker. RUM from phones. GenAI spans with tokens and cost. **Domain metrics for the conference itself** | Dash0 screenshots, a live trace |
| C2 | Agent0 / MCP finds and fixes something real | Incident A: Agent0 pinpoints the bottleneck, and the fix PR links to the investigation | `docs/evidence/INCIDENTS.md` |
| C3 | Observability built in, not added at the end | OTel in the first skeleton PR (git history proves it) | Commit timestamps |
| C4 | Bonus: dashboard and SLO | A "Conference Ops" dashboard, plus 2 SLOs (fanout p95, room occupancy) | Live in the demo |

## D. Track 3: Radar ("AI SRE")
| # | Criterion | 5 looks like | Evidence |
|---|---|---|---|
| D1 | Runs on Kubernetes with Radar connected | Team vcluster with app, worker, valkey and HPA via Argo CD | Radar UI |
| D2 | Radar UI and MCP used while building and operating | Agents shipped and verified rollouts via the Radar MCP all day. Checks before and after | Screenshots, timeline |
| D3 | AI investigation on a real issue, and what we learned and did | A Radar investigation during incident A or B led to a concrete change (limits, HPA, probe, rollback) | Investigation screenshot plus PR |
| D4 | Makes conferences easier | Shared | |

## E. Track 4: Elasticsearch ("Find the Right Talk")
| # | Criterion | 5 looks like | Evidence |
|---|---|---|---|
| E1 | ES is the core data layer | Sessions, transcripts, questions, signals and presence all live in ES. There is no other database | Architecture slide |
| E2 | Smart search | Hybrid retrieval with RRF, `semantic_text`, semantic duplicate detection for questions, nearest-session reroute, RAG with citations | A demo query that keyword search would miss, plus question merging live |
| E3 | Makes conferences easier | Shared | |

## F. Merge Forward ("Conferences for Everyone")
| # | Criterion (our inference) | 5 looks like | Evidence |
|---|---|---|---|
| F1 | Inclusion is core, not a checklist | Captions, anonymous questions, sensory signals and catch-up are *the* product | Demo segment |
| F2 | Real accessibility quality | Keyboard-complete, screen-reader labels, 200% text, contrast, reduced motion | ACCESSIBILITY.md, a quick live VoiceOver or zoom moment |
| F3 | Serves overlooked groups | Names who it serves: deaf or hard-of-hearing attendees, non-native speakers, shy or neurodivergent attendees, caregivers | ACCESSIBILITY.md |

## Scoring sheet (the orchestrator fills this at each gate)
| Gate | A (wtd /100) | B avg | C avg | D avg | E avg | F avg | Lowest 3 criteria and the action for each |
|---|---|---|---|---|---|---|---|
| G2 13:30 | | | | | | | |
| G3 15:30 | | | | | | | |
| G4 16:30 | | | | | | | |

**Rule:** after each gate, the next hour of work goes to the lowest-scoring criteria with the highest weight, not to new features.
