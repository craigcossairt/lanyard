# Timeline: Monday 2026-11-09 (MT)

| Time | Who | What | Gate / exit criteria |
|---|---|---|---|
| 08:30 | Craig | Leave. Laptop at 100%, charger, phone hotspot ready | |
| 09:00 | Craig | Doors open. Check in, sit near power, run a Wi-Fi speed test, start Colima (`colima start`) | Seated with power |
| 09:15–10:00 | Craig | Run the **morning checklist** in 07-setup-runbook.md (accounts verified, keys in the password manager, Elastic deployment healthy) | All green |
| 10:00 | Craig | Kickoff. **Get the Radar join code.** Ask organizers: demo length and format, submission form/URL, team-name rules | Join code and demo format known |
| 10:15–11:00 | Craig | Join the cluster at join.cnh.radarhq.io (takes 3–4 min), accept the Radar Cloud invite, note the cluster id and team name. Paste the answers into this session | Cluster ready |
| **11:00** | This session | **"Create the repo."** Run 07-setup-runbook.md part B (about 20 min). Craig installs the Gitar app on the repo when prompted | Repo public, starter deployed, Gitar active |
| 11:20 | Craig | Open a new T3 thread on the repo and paste 08-orchestrator-prompt.md. **Start the grill-design session** in another thread with 10-design-brief.md | |
| 11:20–12:00 | Orchestrator | WS0 skeleton, WS5 deploy plumbing, WS1 ES prep, all in parallel | **G1 (12:00):** skeleton merged and deployed, contracts package merged |
| 12:00–13:30 | Orchestrator | WS1–WS5 build P0 slices | **G2 (13:30):** join → search → live session works end to end on the deployed URL (ugly is fine). Score against the rubric. If behind, cut P2 now |
| ~13:30 | Design session | Design tokens and components PR merged | UI streams adopt them |
| 13:30 | Orchestrator | Start WS6 accessibility, and WS7 vendor if G2 is green | |
| 14:00 | All | Lunch and the panel. Agents keep building; Craig eats and reviews the deployed app on his phone | |
| 14:30–15:30 | WS5 + WS2 | **Load test v1 → investigate with Agent0 / Radar → fix → re-test** (06-demo.md, incident A) | Evidence captured |
| **15:30** | Orchestrator | **G3: P0 feature freeze.** Score the rubric. Cut anything not green per the scope-cut ladder | All P0 features on the deployed URL |
| 15:30–16:30 | All | Polish, accessibility fixes, P1 only if P0 is solid. README, ACCESSIBILITY.md, AI_USAGE.md, evidence docs | |
| **16:30** | Orchestrator | **G4: code freeze.** Only demo-blocking fixes after this | Final rubric score |
| 16:30–16:45 | Craig | Seed the "CNH Demos" event, print or display the QR, set up the speaker console in Chrome | |
| 16:45–17:05 | Craig | **Record the backup demo video** (screen and voice, 3 min). Rehearse twice with a timer | Video saved locally |
| 17:05–17:15 | Craig | **Submit:** repo URL, README, video. Do not wait until 17:29 | Submission confirmed |
| 17:30–18:30 | Craig | Demos. Run 06-demo.md | |
| 18:30 | | Winners, then House of Kube | |

## Orchestrator check-ins with Craig
Short status at 12:00, 13:30, 15:30 and 16:30: gate result, rubric score, proposed cuts, and decisions needed. Craig is only interrupted for decisions, secrets and Gitar or account clicks.
