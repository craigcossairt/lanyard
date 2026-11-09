# Setup runbook

## Part A: tonight (Craig, about 20 min)

> **Status at 2026-11-09 00:00 MT:**
> - **Dash0:** org "Lanyard" created in us-west-2 (Oregon). The MCP is added, but it needs you to sign in (`/mcp` → dash0).
> - **Radar:** org "Lanyard" created. No cluster yet; the hackathon join code covers that.
> - **Elastic:** Serverless project "My Elasticsearch project" (GCP us-central1, general purpose) exists.
> - **Gitar:** account done. The GitHub App install page is left open; at 11:00, choose **"Only select repositories" → the lanyard repo**, never All, because of Bloom.
> - **API keys:** all four (TypeSafe, OpenAI, Dash0, Elastic) are created and saved in Bitwarden.
> - **MCP config:** Claude has two config locations, the default `~/.claude.json` and Claude Hub's `~/.claude-hub/`. Both now have radar-cloud and dash0. Sign in to each: run `claude`, then `/mcp`, and also `CLAUDE_CONFIG_DIR=~/.claude-hub claude`, then `/mcp`.
> - **Team name:** you choose it at join.cnh.radarhq.io. Plan on `lanyard`; it becomes `https://lanyard.cnh.radarhq.io`.
> - **Still to do:** the Radar MCP sign-in (`/mcp` → radar-cloud). The keys are created at 11:00 and collected through the secret prompt:
>   - Dash0 auth token (ingest + read) and the RUM token
>   - Elastic API key and endpoint
>   - OpenAI API key
>   - TypeSafe (Jev) API key
- [ ] **Dash0:**
  - Finish signup and note the **region**.
  - Settings → Endpoints: note the OTLP endpoint.
  - Create an **auth token** with ingest and read scope, and a RUM token if it's separate. Save them in Bitwarden.
  - Add the MCP (OAuth): `claude mcp add --transport http --scope user dash0 https://api.<region>.aws.dash0.com/mcp`, then run `/mcp` in Claude Code, pick dash0, and sign in.
- [ ] **Elastic Cloud:**
  - Start the trial. Create a **Serverless Elasticsearch project** (general purpose or vector-optimized, in a US region).
  - Note the **endpoint URL** and create an **API key**. Save both in Bitwarden.
  - Creating the environment isn't code, so it's allowed before 11:00.
- [ ] **Gitar:** sign up at app.gitar.ai with GitHub and start the Pro trial. Don't connect a repo yet.
- [ ] **Radar Cloud:** sign in at app.radarhq.io once, so tomorrow's invite lands on an existing account.
- [ ] **OpenAI:** confirm an API key exists for an account that will receive the $50 credits (they may be issued at the event). Save it in Bitwarden.
- [ ] **Finder:** drag Pages, Numbers and Google Drive to the Trash and enter your password. They're root-owned and already partly removed, so they won't launch.
- [ ] **Pick the project name** (09-names.md) and tell this session.
- [ ] **Sleep.** The demo needs you sharp at 17:30.

## Part B: 11:00, in this session. Craig says "create the repo"
Inputs Craig provides in chat:
- the chosen name
- the Radar team name and cluster id
- confirmation that the Bitwarden values exist

Secrets are collected through T3's secret prompt, **never pasted in chat**.

1. Create `craigcossairt/<name>` from the `skyhook-io/cnh-starter` template as a **public** repo, cloned into `~/cnh-2026/<name>`.
2. Run `./scripts/setup.sh <team-name>`, commit, `git pull --rebase`, and push. The starter pipeline then builds and pushes to GHCR.
3. Add the planning package: copy `~/cnh-2026/plan/*` into `docs/plan/` and fill in `Lanyard`.
4. Agent and guardrail files:
   - Merge the starter's `AGENTS.md` and `CLAUDE.md` with the hackathon conventions (from 03-workstreams.md's preamble and 02-contracts.md sections 6–8).
   - From **Trellis**, copy:
     - `.claude/hooks/block-sensitive-files.sh` and `hook-file-path.sh`, plus their settings entries
     - `.gitleaks.toml`
     - the `.env.example` pattern, filled with 02-contracts section 7 (placeholders only)
     - `.github/pull_request_template.md`, adding an **AI usage** line
     - the `grill-design` skill (for the design session)
   - Skip Trellis's TDD method, pre-push gate, hooks CI, brain, security-audit, and non-Claude adapters.
5. Gitar config: copy `11-gitar-config.md`'s drafts into `.gitar/review/*.md`, `.gitar/rules/*.md` and `.gitar/config/apply.md`.
6. PR CI: add a `ci.yml` workflow on `pull_request` running install, typecheck, lint and build. This is what Gitar diagnoses when it fails. Keep the starter's `deploy.yaml` on `main`.
   - **Don't add branch protection that blocks the deploy bot's direct push to `main`.** Enforce "PRs only" through AGENTS.md and the orchestrator.
7. Add `docs/AI_USAGE.md` (skeleton), and `docs/evidence/` with `INCIDENTS.md` and `GITAR.md` skeletons. Commit these through a PR, which becomes the first Gitar-reviewed PR.
8. **Craig clicks:** (Gitar: choose "Only select repositories" and select only the new repo)
   - Install the Gitar GitHub App on the repo.
   - In Gitar settings, enable auto-apply for CI fixes.
   - After the first build, make the GHCR package **public**.
9. Apply `argocd/application.yaml` through the Radar MCP (pass the cluster id). Confirm `https://<team>.cnh.radarhq.io` shows the starter page and its SHA.
10. Create the Kubernetes Secret `app-credentials` in the team namespace with the values from part A, via the Radar MCP or kubectl with the kubeconfig from Secret `kubeconfig`. **Not in git.** Also put a local `.env` (gitignored) for dev.
11. Create the T3 project for `~/cnh-2026/<name>`. Hand Craig the filled-in **08-orchestrator-prompt.md** and **10-design-brief.md**.

**Exit criteria:**
- The repo is public and the starter is live at the team URL.
- Gitar has reviewed PR #1.
- The Secret exists.
- Dash0 and Radar MCPs respond.
- Elapsed time is 25 minutes or less.

## Part C: morning (09:15–10:00, Craig)
- [ ] `colima start` (4 CPU / 8 GiB is fine), then `docker ps` should work.
- [ ] `claude mcp list` should show radar-cloud and dash0. Re-auth if prompted.
- [ ] `gh auth status` should be OK.
- [ ] Load the Elastic endpoint in a browser to confirm the deployment is healthy.
- [ ] Phone hotspot tested with the laptop.
- [ ] Chrome installed and microphone permission allowed for the team URL (needed for speech captions).
