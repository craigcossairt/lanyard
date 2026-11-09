# Demo plan, incident drills and submission

## Ask at kickoff
How many minutes per team? Is it on stage with a projector, or science-fair style? Is there a submission form, and does it need a video? Adjust the script below to fit.

## Pre-demo setup (16:30–16:45)
- In the "CNH Demos" event, add our session ("Lanyard: <team>") to the Main Stage room. **Set the room capacity a little below the expected headcount** so the overflow alert fires honestly once the room joins.
- Screen 1 (projector): speaker console in Chrome, captions on, with the **join QR** big in the corner.
- Have tabs ready on the laptop:
  - organizer ops board
  - Dash0 "Conference Ops" dashboard
  - Radar (workloads and HPA)
  - the GitHub PR list
  - `docs/evidence/INCIDENTS.md`
- Phone: logged in as an attendee, in case nobody scans.

## Script: 3 minutes (stretch to 5 by expanding the bracketed parts)
| t | Beat | Screen | Line (paraphrase) |
|---|---|---|---|
| 0:00 | Hook | QR full screen | "Before I say anything, scan this. You're now attendees of this talk." |
| 0:15 | Live | Speaker console | Captions of me appear as I speak. "Ask me anything, anonymously. Tell me if I'm too fast." |
| 0:35 | ES moment | Clusters | Similar questions merge live: "14 of you asked about X. Elasticsearch merged them semantically." Answer the top one. |
| 0:55 | Insight | Ops board | "Now I'm the organizer. A conference is a distributed system: rooms are services, you are traffic." This room turns red as it crosses the SLO. Click **reroute**, and phones get "closest talk with seats". |
| 1:25 | Dash0 | Dash0 dashboard | "Those are OpenTelemetry metrics for this room, right now." Show your phones' RUM sessions, a trace from phone to API to ES to LLM with token cost, and the SLO. |
| 1:45 | Radar / k8s | Radar | "Your traffic just scaled us": HPA pods. [5-min: the incident A story, Agent0 and the Radar investigation, the fix PR] |
| 2:10 | Gitar | PR list | "One builder, about 8 AI agents, N pull requests, and Gitar reviewed every one." Show the convention rules it enforced and the CI fix it auto-applied. |
| 2:30 | Inclusion | Phone mirror or ops | Captions in Spanish if P1 translation landed (otherwise the original-language captions), large text, catch-me-up. "For anyone who can't hear, can't raise their hand, or had to step out." |
| 2:50 | Close | Title slide | "Lanyard. Conferences, observable." |

**If the network dies:** switch to the backup video at the current beat, and keep narrating live.

## Incident drills (real, evidence-producing; 14:30–16:00)
We build v1 the straightforward way, measure it under realistic load, and fix what the tools show us. Nothing is faked. If a different real problem shows up first, use that one instead.

**Incident A: "Keynote surge"** (Dash0 Agent0 and the Radar AI investigation)
- Run the load script: 300 attendees join one session, hold SSE open, ask, vote and signal.
- Likely real bottlenecks in v1: per-client snapshot queries to ES on every reconnect, synchronous duplicate-detection calls inside the request path, CPU throttling at low limits, or Valkey fanout hot spots.
- Steps:
  1. Watch the fanout SLO burn.
  2. Ask Agent0: "Why did question fanout p95 regress during the load test?"
  3. Run a Radar AI investigation on the app pods (throttling, restarts, HPA behaviour).
  4. Fix: for example, cache the snapshot, move duplicate detection to an async worker with optimistic UI, tune requests and limits or the HPA.
  5. Re-run the load and compare.
- Capture screenshots before and after, and both investigation outputs, in `INCIDENTS.md`.

**Incident B: "Bad release"** (Radar and Argo CD; use whichever happens naturally first)
- A deploy fails readiness. For example, a new env var isn't in the Secret, or the worker crash-loops.
- Steps:
  1. A Radar investigation explains it.
  2. Roll back or fix through Argo CD.
  3. Record the Radar timeline.

**Incident C: "CI red"** (Gitar)
- With about 8 agents this will happen on its own: a type error from a contract change.
- Gitar diagnoses it, auto-apply pushes the fix, and you record the PR link.

**Incident D: "Token burn"** (Dash0 GenAI spans; optional)
- If catch-up or ask-the-conference shows high token cost in OpenLIT spans, shrink the context through tighter ES retrieval and show the cost drop.

## Submission checklist (done by 17:15)
- [ ] The repo is public. README covers: pitch, screenshots, architecture diagram, track mapping, setup steps, live URL
- [ ] `docs/AI_USAGE.md`: harnesses and models used, what the humans decided versus what the AI wrote (the rules require disclosure)
- [ ] `docs/ACCESSIBILITY.md`, `docs/evidence/INCIDENTS.md`, `docs/evidence/GITAR.md`, Dash0 and Radar screenshots
- [ ] Backup video saved (and uploaded, if the form asks for one)
- [ ] Gitleaks scan is clean. No keys in the repo or its history
- [ ] Submission form sent. Note the confirmation

## Craig must be able to explain (rule 6)
- The architecture (one image, three Deployments, ES, Valkey, the OTel pipeline).
- Why ES is the data layer.
- How duplicate detection works (semantic top-1 plus a threshold).
- How reroute picks alternatives.
- How the role tokens work.
- What each incident was and how it was fixed.

The orchestrator prepares a 1-page cheat sheet, `docs/plan/CHEATSHEET.md`, at G4.
