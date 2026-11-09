# Demo plan: the 3-minute product walkthrough (recorded video)

**The submission is a 3:00 recorded video** (no live demo). It is a **product walkthrough**: the submission form explains how the sponsor tools are used, so the video shows Lanyard working and spends at most one 10-second glance on Dash0 and Radar as proof it is real. Craig records after the 16:30 freeze and submits by 17:15.

Status marks, from a QA pass of https://lanyard.cnh.radarhq.io on 2026-11-09 (15:13–15:21 MT, version `a4f5e70`) plus the code on `main` at 16:40 MT (`e9f863d`). Mark a beat ⚠️ until someone has watched it work on the live site, and do not say it in the voiceover until then:

- ✅ seen working on the deployed URL
- ⚠️ in `main` but not yet seen working by WS10 (re-check in the dry run); the table gives the fallback wording
- 🔧 worked badly when last seen; re-check, and cut the beat if it still does

## The insight (the hook, in the first 10 seconds)

> A conference is a distributed system. Rooms are services. Attendees are traffic. A full room is an incident. Organizers run it blind; Lanyard gives every person in the building a view of the same live system.

## How to record

- Screen at 1920×1080, Chrome, browser zoom 100%, bookmarks bar hidden, dark theme.
- **Organizer window on the left, about 1500×1080** (the ops board is built for 1920×1080; if you want it full width, record the phone separately and composite it).
- **Phone window on the right, 390×844** (Chrome device mode or a real phone mirrored), joined to the room.
- Record the **demo scenario once, start to finish (150 s)**, with every window visible, then cut into the beats below. The scenario is deterministic, so the cut points are the same every run. Do not try to narrate the scenario live; record the voiceover after.

### Scenario clock (WS4 measured; `t` = seconds after clicking **Demo scenario**)

| t | What happens |
|---|---|
| +0 | Click **Demo scenario** on the organizer board (40 simulated people, labelled SIMULATED) |
| +4.8 s | First scripted caption (then one about every 4 s) |
| +11.3 s | First paraphrased question; questions merge into clusters ("joined N others") |
| +36.7 s | Louder alert (five-person burst) |
| +66.7 s | Main Stage over capacity: card turns red ("Overflow risk"), incident card with **Reroute to nearby seats** |
| after you click Reroute | Phones get the suggestion; simulated people accept and move to Side Stage. Not timed by WS4 yet, so watch for it in the dry run |
| +150 s | Scenario auto-stops, then "Cleaning up demo…". A new run is refused until cleanup finishes |

**Do not click "Swap rooms…" or "Pre-announce"** on the board; they are placeholders.

## Shot list (target 2:55)

| Video time | Beat | On screen | Voiceover | Status |
|---|---|---|---|---|
| 0:00–0:10 | **Hook** | Landing page, then the big join QR at `/qr/cnh-demos`. Text: "Lanyard. Conferences, observable." | "A conference is a distributed system. Rooms are services, attendees are traffic. Scan this and you're an attendee." | ⚠️ `/qr/cnh-demos` and the landing page are in `main`; not yet seen |
| 0:10–0:22 | **Join and semantic search** | Phone (390×844): join with no sign-up (you get a random handle, e.g. "Calm Wren"), search **eBPF but for security folks**, show the top hit *Beyond Harnesses and Sandboxes: Runtime Protection for AI Agents with eBPF*. Optional second query `restrain rogue copilots` (hit *Agentic Ops…* at rank 2, no shared words). | "No sign-up, no app. I type what I mean, not what the title says, and it finds the talk." *(Say "semantic", not "highlighted": the match text just echoes the title.)* | ✅ both searches work **in the KubeCon event** (`/join?again=1&event=kubecon-na-2026`). In CNH Demos (the default join) search returns two irrelevant talks, so join KubeCon for this beat |
| 0:22–0:28 | **Plan my day** | Phone: `/a/plan`, interests, **Build my day**, then the plan cards. | "Tell it what you care about and it builds a day, and every pick cites a real session." | 🔧 at 15:15 the cards said "Session details are loading" forever, had no titles or add button, and quoted times in UTC. Re-check on the latest deploy; **if it still does, cut this beat** (the walkthrough does not need it) |
| 0:28–0:55 | **Live session: captions, questions, signals, catch-up** | Phone in the Main Stage room (`/a/s/cnh-demos-opening`) while the scenario runs (t+0 to t+37). Captions stream. Tap **Ask**, send a question. Watch the cluster grow ("joined N others"). Tap **Louder**. Tap **Catch up**. | "Now I'm in the room. Captions arrive as the speaker talks, so I don't need to hear it. I ask anonymously. When others ask the same thing in different words, mine joins theirs, and the speaker answers once. If it's too fast or too quiet, I tap a signal. Stepped out? Catch me up." | ✅ captions, ask, vote, Louder (seen by the speaker) and catch-up work. ⚠️ the exact "joined N others" copy and the scripted merges are not yet seen (I saw "2 people asked this" on a simulated cluster). If the copy differs, read what is on screen |
| 0:55–1:10 | **Speaker console** | Speaker console on the laptop (`/s/cnh-demos-opening`), then **Stage mode** (the speaker stage window with the slide and join QR): ranked question clusters, the signal meter reacting to the Louder burst, attendance. | "The speaker sees the room: questions ranked by votes and how many people asked, the signals, who's here." | ✅ clusters, signal meter and attendance on the console. ⚠️ the stage window (slide plus QR, PR #58) not yet seen |
| 1:10–1:45 | **Ops board: the saturation incident** | Organizer board (the scenario you started at the top of the take): **Rooms as services**. Main Stage turns red at about t+66.7 ("Overflow risk", over 100%). Click **Reroute to nearby seats**. Cut to the phone: the suggestion appears; tap accept; you land in Side Stage. Board: Main Stage back under the 90% target, Side Stage filling. SIMULATED stays visible. | "This is the organizer. Main Stage just went over capacity: that's an incident. One click reroutes people to the closest talk with seats. The phone gets the suggestion, and I'm in Side Stage. These attendees are simulated and labelled." | ✅ overflow, red state and Reroute ("Suggestions sent to 34 attendees", occupancy moved to Side Stage, cleanup to 0) with the older crowd simulator. ⚠️ the new **Demo scenario** button, the phone-side accept and the timings are WS4's numbers, not yet seen by WS10 |
| 1:45–2:00 | **Ask the conference** | Organizer board, **Ask the conference**: type `What are attendees asking about?`, show the answer and its sources. | "And the organizer can ask the whole conference: every transcript and question, with citations." | ✅ answer with 3 sources in under 9 s. After the demo reset it may be less rich; try it in the dry run. The three sources read identically, so do not dwell on them |
| 2:00–2:30 | **Inclusion** | Phone: `/a/settings`, set text to XXL, high contrast, reduce motion; back to the live room (large captions). Laptop, 3 s: speaker console "Start captions" (allow the mic, say one line so a real caption lands on the phone). Phone: **Meet people** (the opt-in networking screen). | "For anyone who can't hear, can't raise their hand, or had to step out: live captions, anonymous questions, signals, catch me up. Big text, contrast and reduced motion follow you. And networking is opt-in: you choose to be found." | ✅ settings apply instantly with no sideways scroll; the speaker console shows "Microphone access was blocked…" if the mic is denied. ⚠️ a real mic caption and **Meet people** not yet seen |
| 2:30–2:40 | **Proof it's real** (at most one glance) | Dash0 "Conference Ops" dashboard for 5 s, Radar Cloud workloads for 5 s. No explaining. | "It's real: instrumented in Dash0, running on Kubernetes in Radar." | ⚠️ not seen by WS10 (the Dash0 and Radar tools needed sign-in); Craig opens both tabs first. If either looks wrong, drop the glance and keep the line |
| 2:40–2:55 | **Close** | End card: "Lanyard. Conferences, observable." and the URL. | "Lanyard. Conferences, observable." | ✅ |

Total 2:55. The video must stay under 3:00 including the end card.

## Pre-recording checklist (16:45–17:00)

1. **Freeze and version.** Confirm with the orchestrator that nothing deploys during the take. Note `curl https://lanyard.cnh.radarhq.io/healthz` (`version`).
2. **Run the demo reset first** (the orchestrator's clean-slate step for `cnh-demos`). Before it, the event had leftovers: 13–15 old questions (some labelled SIMULATED), `[ws2 verify] caption check` captions on the live feed and old resolved incidents. After it, check `/o` shows Main Stage `0 / 30`, no active incident, "Crowd simulator is stopped", and the speaker console shows no old questions.
3. **Fresh role links, minted locally, never shown on screen.** Mint organizer and speaker links for `cnh-demos` (`npm run mint-link -- --role organizer --event cnh-demos --ttl-hours 3 --env-file ~/cnh-2026/lanyard/.env`, same for `--role speaker`). Open each in a clean Chrome profile **off screen**, so the address bar and history never show `#t=`; the app strips the token from the URL. Never paste a link into chat, a file or a PR. A stored token had only minutes left earlier today, so mint after the reset.
4. **Two attendee windows or profiles.** One joined to **KubeCon NA 2026** (for search), one to **CNH Demos**, sitting in the Main Stage room (`/a/s/cnh-demos-opening`) before you click Demo scenario. Each join makes a new handle; that is fine.
5. **Browser.** Chrome, zoom 100%, bookmarks bar hidden, extensions off, dark theme. Phone window exactly 390×844.
6. **Mic.** Chrome site permission for `lanyard.cnh.radarhq.io`: allow the microphone, then say one line so a real caption appears. Otherwise show the "Microphone access was blocked" state.
7. **Quiet screen.** Do Not Disturb on, notifications off, Slack, Mail and Messages closed, calendar banners off, desktop clean, clock and battery out of frame.
8. **Tabs, in order.** Landing and QR, organizer board, speaker console and stage window, Dash0 "Conference Ops" dashboard, Radar Cloud for `lanyard`. Sign in to Dash0 and Radar beforehand.
9. **Dry run.** Click **Demo scenario**, watch all 150 s on the organizer and the phone (including the phone accepting the reroute), then wait for "Cleaning up demo…" to finish. Write down the three times you will cut on (first question, red Main Stage, accept). Then run the demo reset again before the take.
10. **Gateway.** The platform cuts SSE streams every 15 s; before the clean-recycle fix is deployed the phone shows "Reconnecting… captions may be behind" for a few seconds. If it shows during the dry run, cut around it or retake the beat.
11. **Backups.** Record each beat as its own clip so any one can be re-shot. Keep the raw recording and the export in two places.

## 60-second fallback cut

Use if time runs out. All clips come from the same recording session.

| Time | Beat | Voiceover |
|---|---|---|
| 0:00–0:08 | Join QR | "A conference is a distributed system: rooms are services, attendees are traffic. Scan to join." |
| 0:08–0:20 | Phone: search `eBPF but for security folks`, top hit | "I find talks by meaning, not keywords." |
| 0:20–0:36 | Phone: captions, a question that joins others, a Louder tap; speaker console meter | "Live captions, anonymous questions that merge, signals the speaker can see." |
| 0:36–0:52 | Board turns red, click Reroute, phone shows the suggestion, accept, Side Stage | "Main Stage is full. One click reroutes people to the closest talk with seats." |
| 0:52–1:00 | End card | "Lanyard. Conferences, observable." |

## Gotchas found in QA

- **Search needs the KubeCon event.** CNH Demos has only two sessions, so `eBPF but for security folks` finds nothing relevant there. Join via `/join?again=1&event=kubecon-na-2026`.
- **Don't show `/join` on camera.** At 15:15 it was an unstyled browser form; start from the QR or the attendee home. Re-check.
- **Navigate in the app, not by pasting URLs** while recording: a hard load shows a bare "Loading…" for a moment.
- **The hidden duplicate caption is not a bug.** Each caption also lives in an off-screen polite live region for screen readers.
- **Merging is deliberately strict** (similarity cutoff 0.848): hand-typed paraphrases often stay separate. Rely on the scenario's scripted paraphrases.
- **"Questions" on the organizer board counts all questions;** the speaker console says "open questions". Don't compare them on screen.

## Submission checklist (done by 17:15)

- [ ] The 3:00 video is recorded, exported (under 3:00) and uploaded or linked as the form requires. Keep a second copy.
- [ ] The repo is public. README covers: pitch, screenshots, architecture diagram, track mapping, setup steps, live URL
- [ ] `docs/AI_USAGE.md`: harnesses and models used, what the humans decided versus what the AI wrote (the rules require disclosure)
- [ ] `docs/ACCESSIBILITY.md`, plus the evidence in `docs/evidence/` (Gitar, Radar, Elastic, incidents) the form refers to
- [ ] Gitleaks scan is clean. No keys or role links in the repo, the video or its history
- [ ] Submission form sent. Note the confirmation

## Craig must be able to explain (rule 6)

- The architecture (one image, three Deployments, ES, Valkey, the OTel pipeline).
- Why ES is the data layer.
- How duplicate detection works (semantic top-1 plus a 0.848 threshold, deliberately conservative).
- How reroute picks alternatives.
- How the role tokens work.
