# Demo plan: the 3-minute recorded video, incident drills and submission

**The submission is a 3:00 recorded video** (no live demo). Craig records it around 16:35–17:05 and submits by 17:15. Code freeze is 16:30. This file is the shot list, voiceover, rubric map, pre-recording checklist and fallback cut. The old live-demo script is gone; the incident drills and submission checklist at the bottom still apply.

Status marks used below, based on a QA pass of https://lanyard.cnh.radarhq.io (version `a4f5e70`, 2026-11-09 15:13–15:21 MT):

- ✅ seen working on the deployed URL
- ⚠️ not yet seen working; do not claim it in the voiceover until someone has watched it work
- 🔧 works, but a known bug will show on camera (owner and fix are in the QA bug list the WS10 report sends to the orchestrator)

## The insight (say it in the first 10 seconds)

> A conference is a distributed system. Rooms are services. Attendees are traffic. A full room is a saturation incident. A confused audience is an error budget burning. Organizers run that system blind; we instrument it like production.

Everything in the video either proves that sentence or proves that every person in the room gets something from it.

## How to record (one screen, two windows)

Record the screen at 1920×1080 with two browser windows side by side, so one take shows both sides of the story:

- **Laptop window**, 1180×900 CSS px: organizer board, speaker console, Dash0, Radar and GitHub tabs.
- **Phone window**, 390×844 CSS px (browser device mode or a real phone mirrored): the attendee. Dark theme, default text size until the inclusion beat.

Use Chrome (the speaker console's mic captions need it). Browser zoom 100%. Hide the bookmarks bar.

Record the simulator once as its own clip (150 s) and cut it into the beats below. Do not try to sync a live run to the voiceover.

## Shot list (target 2:55)

The SIMULATED run is the `mode: demo` scenario (PR #57 plus WS4's button, still landing at 15:20 MT): 40 virtual attendees, scripted speaker captions every 4 s, four paraphrase groups of questions and 24 votes, one five-person louder burst, Main Stage staged from 20 to 34 people at 60 s (capacity 30), reroute accepted only after the organizer clicks, stop and cleanup. The older `mode: crowd` simulator is ✅: at 15:19 MT it took Main Stage to 34 / 30 (113%, red "Overflow risk"), the incident card offered **Reroute to nearby seats**, and one click showed "Suggestions sent to 34 attendees", then occupancy moved to Side Stage and cleanup brought the board to 0. Use `crowd` mode as the backup if `demo` mode is not ✅ by 16:15.

| Time | Beat | On screen (window, URL) | Voiceover | Proves |
|---|---|---|---|---|
| 0:00–0:12 | **Hook and insight** | Laptop: organizer board `/o`, event CNH Demos, simulator stopped, rooms at 0. Title text "Lanyard. Conferences, observable." | "A conference is a distributed system. Rooms are services, attendees are traffic. Organizers run it blind. Lanyard instruments the conference the way you instrument production." | A2 (originality), A1 |
| 0:12–0:27 | **Semantic search** (Elastic) | Phone: attendee joined to **KubeCon NA 2026** (not CNH Demos, see Gotchas). Search `restrain rogue copilots`, results list, the hit *Agentic Ops: Building Guardrails for Autonomous AI with Policy-as-Code* at rank 2. | "No anonymous sign-up, no app. I type what I mean, not what the title says. 'Restrain rogue copilots' shares no words with the talk, but Elasticsearch finds it: hybrid BM25 plus semantic search, fused with RRF." | E1, E2, A3, A1 |
| 0:27–0:55 | **Live room: captions, questions, signals** | Start the SIMULATED run (laptop window, organizer board, then switch). Phone window on `/a/s/cnh-demos-opening`: captions scroll, tap **Ask**, send a question, see "N people asked this", tap **Louder**. Cut to speaker console `/s/cnh-demos-opening` for 5 s: the clusters and the Louder meter at 1. Typed note appears as a caption on the phone. | "Now I'm in a room. Captions arrive as the speaker talks, so I don't need to hear it. I ask anonymously, and when twelve of us ask the same thing in different words, Elasticsearch merges them into one question the speaker can answer once. If it's too fast or too quiet, I tap a signal and the speaker sees it." | F1, A1, E2, A3 |
| 0:55–1:22 | **Ops board: the saturation incident** | Laptop: organizer board. Main Stage turns red ("Overflow risk", 34 / 30, 113%); incident card appears; click **Reroute to nearby seats**; "Suggestions sent to 34 attendees"; cut to phone showing the nearest talk with seats; board: Main Stage back under 90%, Side Stage filling. Label "SIMULATED" stays visible. | "This is the organizer. Main Stage just crossed its SLO: 113%. That's a saturation incident. One click reroutes everyone to the closest talk with seats, chosen by semantic nearest neighbour. These attendees are simulated and labelled as such." | A2, A1, E2, D4/B4/E3 (theme) |
| 1:22–1:35 | **Ask the conference** | Laptop: scroll to "Ask the conference". Type `What are attendees asking about?`, wait for the cited answer; point at the sources. | "And the organizer can ask the whole conference: RAG over every transcript and question, with citations I can click." | A3, E2 |
| 1:35–1:50 | **Dash0** (15 s) | Laptop tab: Dash0 "Conference Ops" dashboard (link on the board), then one trace phone → API → ES (→ LLM with tokens), then the "Rooms below 90%" SLO burning, then click **Investigate with Agent0**. | "Every one of those clicks is OpenTelemetry. Room occupancy is a metric, the SLO is in Dash0, and Agent0 answers 'which rooms are above 90% and what is burning the budget'. Browser to worker, one trace." | C1, C2, C3, C4, A3 |
| 1:50–2:03 | **Radar** (13 s) | Laptop tab: Radar Cloud, cluster `lanyard`: workloads `app`, `worker`, `valkey`, HPA. Then Checks before and after (`docs/evidence/radar-checks-before.png` and the after screenshot). Then the investigation `chat_RjOgOymzUJCDCUUF` and its follow-up change: `startupProbe` in PR #23. | "It runs on Kubernetes with Argo CD, and Radar is how the agents shipped and verified every rollout. A Radar investigation told us the probes fire before the process listens, so we added a startupProbe. Checks before and after." | D1, D2, D3 |
| 2:03–2:15 | **Gitar** (12 s) | Laptop tab: GitHub PR list (merged count, every PR reviewed), one PR with a Gitar rule comment (e.g. `deploy-budget` on #2), `.gitar/review/` and `.gitar/rules/` files. | "One builder, ten AI agents, every change a pull request, and Gitar reviewed all of them. Its rules encode our conventions: telemetry spans, privacy, UTC, accessibility, the cluster budget." | B1, B2, B3 |
| 2:15–2:40 | **Inclusion** (25 s) | Phone: `/a/settings` (XXL text, high contrast, reduce motion), back to the live room (large captions), tap **Catch up** ("last 10 minutes, summarised from the captions"). Laptop, 4 s: speaker console, "Start captions" with the browser's mic prompt (allow) or the "Microphone access was blocked" message. | "For anyone who can't hear, can't raise their hand, or had to step out: live captions, anonymous questions, sensory signals, and catch me up. Text size, contrast and motion follow you. Built for deaf and hard-of-hearing attendees, non-native speakers, shy or neurodivergent attendees, and caregivers." | F1, F2, F3, A1 |
| 2:40–2:55 | **Depth and close** | Laptop: the architecture one-liner as an on-screen card: browser → `app` (HPA) → Valkey → `worker` → Elasticsearch, all traced to Dash0, on a Radar vcluster, shipped by PRs. End card: "Lanyard. Conferences, observable." and the URL. | "Elasticsearch is the only database. Valkey fans out in real time. A worker runs the LLM jobs. Dash0 sees all of it, Radar runs it, Gitar gated it. Lanyard: conferences, observable." | A3, A4, A5 |

Total 2:55. The video must stay under 3:00 including the end card.

### Sponsor inserts: what to show and what is honest today

| Sponsor | Show | Status at 15:21 MT |
|---|---|---|
| **Elastic** (beat 0:12) | Search `restrain rogue copilots`, hit at rank 2 (`docs/evidence/ELASTIC.md`: BM25 finds no match, hybrid ranks it 2). Fallback query `eBPF but for security folks` also works and returns *Beyond Harnesses and Sandboxes: Runtime Protection for AI Agents with eBPF* in the top results. | ✅ both seen working in the KubeCon event. The "Why this matched" line only echoes the title, so say "semantic" in the voiceover, not "highlighted" |
| **Elastic** (merge) | "N people asked this" on a merged cluster. Hand-written paraphrases often do **not** merge (the cutoff is deliberately 0.848): my own paraphrase of the simulated capacity question stayed separate. Use the simulator's four paraphrase groups, or the calibrated pair in `data/seed/question-pairs.json` ("What happens when a room reaches its capacity?" / "What do you do when the room fills up?"). | ✅ one simulated cluster showed "2 people asked this" on the speaker console; ⚠️ the demo-mode waves are not yet seen |
| **Dash0** (beat 1:35) | Dashboard, one trace, the SLO, Agent0. The four links are on the organizer board. | ✅ the four links exist on `/o` and RUM posts reach `ingress…dash0.com` from phones. ⚠️ the dashboard content, a specific trace and an Agent0 answer have not been seen by WS10 (the Dash0 MCP needed sign-in). Craig must pre-open and check each tab |
| **Radar** (beat 1:50) | Cluster `lanyard`, Checks before/after, the investigation and the `startupProbe` change. | ✅ before screenshot, investigation and #23 are in `docs/evidence/RADAR.md`. ⚠️ the "after" screenshot (PR #46) was still open at 15:21 |
| **Gitar** (beat 2:03) | PR list, a rule firing, the `.gitar` files. | ✅ `docs/evidence/GITAR.md` lists real comments (e.g. `deploy-budget` on #2). ⚠️ no auto-applied CI fix is recorded yet; do not claim B3 unless a PR with an auto-apply commit exists. Do not claim "40+ PRs": as of 15:21 MT there were 63 PRs (47 merged, 15 open, 1 closed); say the real number on the day |

## Pre-recording checklist (16:15–16:35)

1. **Freeze.** Confirm with the orchestrator that nothing deploys during the take. Check `curl https://lanyard.cnh.radarhq.io/healthz` for the version and note it.
2. **Fresh links.** Mint organizer and speaker links for `cnh-demos` with a TTL of at least 3 hours (`npm run mint-link -- --role organizer --event cnh-demos --ttl-hours 3 --env-file ~/cnh-2026/lanyard/.env`). The links expire: one stored organizer token had only minutes left at 15:19 MT. **Never paste links into chat, files or PRs.** Open each in a clean Chrome profile; the app then strips the token from the URL.
3. **Two attendee identities.** One incognito phone window joined to KubeCon NA 2026 (for search), one joined to CNH Demos (for the live room). Joining again creates a new handle ("Calm Wren", "Brave Owl"); that is fine.
4. **Clean slate.** Before the take there were leftovers on `cnh-demos`: 13–15 questions on Main Stage (including ones labelled "SIMULATED"), six `[ws2 verify] caption check` captions in the live feed and three "Resolved" incidents from 2:49 PM. Ask WS2/WS4 to clean up (WS2's `cleanupSynthetic` is PR #60), or accept that a cluster of old questions will be visible. Ask-the-conference answers can mention these, so rerun it after cleanup.
5. **Simulator reset.** Organizer board shows "Crowd simulator is stopped", Main Stage `0 / 30`, no active incident. Do one dry run of the demo scenario. Leave 10 minutes of headroom: a run auto-stops after 10 minutes and a new run is refused until cleanup finishes.
6. **Browser.** Chrome, zoom 100%, bookmarks bar hidden, extensions off, dark theme, `prefers-reduced-motion` left alone until the inclusion beat. Phone window 390×844.
7. **Quiet.** Do Not Disturb on, Slack/Mail/Messages closed, calendar and notification banners off, desktop clean, battery and wifi icons out of frame.
8. **Mic.** Chrome site permission for `lanyard.cnh.radarhq.io`: allow the microphone once, then say one live line ("Welcome to Lanyard") so a real caption appears on the phone. If the prompt is unwanted, keep the typed-note path (✅ works: a typed note reached the phone as a caption within about 3 seconds) and show the blocked state (✅: "Microphone access was blocked. Allow the mic for this site, then start again.").
9. **Tabs, in order.** (1) organizer board, (2) speaker console `/s/cnh-demos-opening`, (3) Dash0 dashboard, one trace, the SLO, Agent0, (4) Radar Cloud for `lanyard`, (5) GitHub PR list and one Gitar comment, (6) `docs/evidence` screenshots. Sign in to Dash0 and Radar beforehand.
10. **Check the gateway.** The platform cuts SSE streams every 15 s. Until PR #59 (clean rotation, Last-Event-ID replay) is deployed, the phone shows "Reconnecting… captions may be behind" and the organizer shows "Stream reconnecting · polling every 10 seconds" for a few seconds at a time. Check at 16:15; if it still shows, cut around it.
11. **Voiceover.** Read the script twice with a timer. The Dash0, Radar and Gitar inserts are 12–15 s each: rehearse them as one breath each.
12. **Backups.** Record each beat as its own clip so any one can be re-shot. Keep the raw screen recording and the exported video in two places.

## 60-second fallback cut

Use if recording runs late or the full take has a bad section. All clips come from the same recording session; only trim and rejoin them.

| Time | Beat | Voiceover |
|---|---|---|
| 0:00–0:08 | Organizer board, title card | "A conference is a distributed system: rooms are services, attendees are traffic. Lanyard instruments it." |
| 0:08–0:20 | Phone: search `restrain rogue copilots`, hit at rank 2 | "I find talks by meaning, not keywords. Elasticsearch, hybrid search." |
| 0:20–0:36 | Phone: captions scroll, a merged question, Louder tap; speaker console meter | "Live captions, anonymous questions that merge, signals the speaker can see." |
| 0:36–0:50 | Board turns red at 113%, click Reroute, phone shows the nearest talk with seats | "Main Stage is full. One click reroutes everyone." |
| 0:50–1:00 | Three-second cards: Dash0 SLO, Radar Checks, Gitar PR list; end card | "Observed in Dash0, run on Radar, every PR reviewed by Gitar. Lanyard: conferences, observable." |

## Gotchas found in QA (as of 15:21 MT)

- **Search needs the KubeCon event.** An attendee who joins "CNH Demos" (the default) has only two sessions, so `eBPF but for security folks` returns two irrelevant talks. Join via `/join?again=1&event=kubecon-na-2026`.
- **Do not show `/join` on camera.** It renders as an unstyled browser form (default select and button). Start from the attendee home.
- **Do not show "Plan my day" yet.** The plan cards say "Session details are loading" forever, have no titles and no add button, and quote times in UTC ("17:43–17:48 UTC", "All times are UTC"), which breaks the Denver-time rule. It is ⚠️ until fixed; plan beats are cut from the main script.
- **Lazy-load flash.** Hard navigation to `/a/plan` or `/s/...` shows a bare "Loading…" for a moment. Navigate within the app, not by pasting URLs, while recording.
- **Duplicate text in the DOM is not a bug.** The caption feed has a visible line and an off-screen polite live region with the same text.
- **Ask-the-conference sources all read "CNH Demos: live demos · audience question"**; they cannot be told apart on screen.
- **The numbers on the board are not the same thing.** Organizer "Questions 13" counts all questions; the speaker console says "2 open questions".

## Incident drills (real, evidence-producing; 14:30–16:00)

We build v1 the straightforward way, measure it under realistic load, and fix what the tools show us. Nothing is faked. If a different real problem shows up first, use that one instead. Whatever is recorded in `docs/evidence/INCIDENTS.md` and `RADAR.md` before 16:30 feeds the Dash0, Radar and Gitar inserts above. As of 15:21 MT `INCIDENTS.md` is still an empty table.

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
- With about ten agents this will happen on its own: a type error from a contract change.
- Gitar diagnoses it, auto-apply pushes the fix, and you record the PR link.

**Incident D: "Token burn"** (Dash0 GenAI spans; optional)
- If catch-up or ask-the-conference shows high token cost in OpenLIT spans, shrink the context through tighter ES retrieval and show the cost drop.

## Submission checklist (done by 17:15)
- [ ] The 3:00 video is recorded, exported (under 3:00) and uploaded or linked as the form requires. Keep a second copy.
- [ ] The repo is public. README covers: pitch, screenshots, architecture diagram, track mapping, setup steps, live URL
- [ ] `docs/AI_USAGE.md`: harnesses and models used, what the humans decided versus what the AI wrote (the rules require disclosure)
- [ ] `docs/ACCESSIBILITY.md` (PR #52), `docs/evidence/INCIDENTS.md`, `docs/evidence/GITAR.md`, Dash0 and Radar screenshots
- [ ] Gitleaks scan is clean. No keys or role links in the repo or its history
- [ ] Submission form sent. Note the confirmation

## Craig must be able to explain (rule 6)
- The architecture (one image, three Deployments, ES, Valkey, the OTel pipeline).
- Why ES is the data layer.
- How duplicate detection works (semantic top-1 plus a threshold of 0.848, deliberately conservative).
- How reroute picks alternatives.
- How the role tokens work.
- What each incident was and how it was fixed.

The orchestrator prepares a 1-page cheat sheet, `docs/plan/CHEATSHEET.md`, at G4.
