# Gitar evidence

Notable Gitar reviews, rule hits and auto-applied CI fixes.

## Final totals (2026-11-09T23:58Z, from the GitHub API)

| | Count |
|---|---|
| PRs opened | **92** (79 merged, 11 open, 2 closed) |
| PRs where Gitar left inline findings | **66** |
| Gitar inline findings (top-level review threads) | **135** |
| ...of which Bug or Security | **58** |
| Gitar auto-apply commits | **2** (#42 fixed a real CI failure; #49 fixed a doc finding) |
| Custom rule hits shown here | `deploy-budget` budget table (#2) |

Gitar reviewed every PR. The orchestrator merged only after each Gitar thread was fixed or answered with a reason.

## Incident C: CI red, fixed by Gitar auto-apply (B3)

**PR:** [#42](https://github.com/craigcossairt/lanyard/pull/42) (WS5, Dash0 assets as code)

1. CI `check` failed on lint: 11 × `no-undef` for `process`, `console` and `fetch` in `docs/evidence/dash0/apply.mjs`. The ESLint config gave Node globals to `scripts/**` but not to `docs/`.
2. We commented [`gitar auto-apply:on`](https://github.com/craigcossairt/lanyard/pull/42#issuecomment-6752534203).

| Time (UTC) | Head | CI |
|---|---|---|
| 21:55:41 | `8938e02` (ours) | **failure** |
| 21:59:48 | [`4aa9bc8`](https://github.com/craigcossairt/lanyard/commit/4aa9bc8) by **gitar-bot**: "fix: lint Dash0 evidence script" (`eslint.config.js` +1: `'docs/evidence/dash0/*.mjs'` added to the Node-globals block) | — |
| 21:59:56 | `4aa9bc8` | **success** |

Red to green in **about 4 minutes, with no human edit.** The orchestrator merged it as #42.

A second auto-apply: on [#49](https://github.com/craigcossairt/lanyard/pull/49) (WS1), gitar-bot committed `fa2c531` "docs: clarify plan validation", a wording fix for its own finding.

## Notable catches

| PR | What Gitar caught or fixed | Rule / review file | Outcome |
|---|---|---|---|
| [#1](https://github.com/craigcossairt/lanyard/pull/1) | ⚠️ Security: the sensitive-file hook in `.claude/settings.json` matched `Edit`/`Write` but skipped `MultiEdit`, so an agent could still edit `.env` | Built-in security review | Fixed before merge (hook covers MultiEdit) |
| [#1](https://github.com/craigcossairt/lanyard/pull/1) | ⚠️ Security: the SSE `?token=` design would put bearer tokens into span attributes and request logs | Built-in security review, `.gitar/review/privacy.md` | Contract §4 changed: tokens only in the `Authorization` header (SSE via `fetch`), plus redaction of any `token` query param as a backstop |
| [#2](https://github.com/craigcossairt/lanyard/pull/2) | **Custom rule fired:** `deploy-budget` posted the resource totals against the team budget (450m / 576Mi requests, 1250m / 1184Mi limits; "within budget"), matched our PR arithmetic, and warned that the planned peak of 3.75 / 4 CPU limits is tight ([comment](https://github.com/craigcossairt/lanyard/pull/2#issuecomment-6748725828)) | `.gitar/rules/deploy-budget.md` | Informational; peak headroom is tracked for the worker + HPA PR |
| [#2](https://github.com/craigcossairt/lanyard/pull/2) | 💡 `envFrom` of the whole `app-credentials` Secret broke the repo's `secretKeyRef` convention and would inject stray keys | `.gitar/review/kubernetes.md` | Fixed: one `secretKeyRef` per contract secret ([b0a86ca](https://github.com/craigcossairt/lanyard/commit/b0a86ca)) |
| [#2](https://github.com/craigcossairt/lanyard/pull/2) | 💡 Non-secret contract env (`LLM_MODEL_CHAT`, `LLM_MODEL_FAST`, `DASH0_RUM_ENDPOINT`) missing from the manifest | Contract sync, §7 | Fixed once the orchestrator chose the values ([fb58038](https://github.com/craigcossairt/lanyard/commit/fb58038)) |
| [#3](https://github.com/craigcossairt/lanyard/pull/3) | 🔴 High risk flagged: the `--recreate` setup path deletes all ten ES indices, which would erase live questions, captions, presence and signals if run during the event | Built-in risk summary | Kept as a dev-only flag; not to be run once the event is live |
| [#3](https://github.com/craigcossairt/lanyard/pull/3) | 💡 README hard-coded the author's local `.env` path; smoke assertion failures misreported as Elasticsearch errors | Built-in review | Both fixed before merge |
| [#4](https://github.com/craigcossairt/lanyard/pull/4) | 💡 Evidence log used local `HH:MM` times instead of UTC ISO-8601 | `.gitar/review/time.md` | Fixed ([273e476](https://github.com/craigcossairt/lanyard/commit/273e476)) |
| [#8](https://github.com/craigcossairt/lanyard/pull/8) | ⚠️ Security: `GET /api/events/:eventId` was unauthenticated and leaked the join code | Built-in security review | Resolved before merge (merge rule: fixed or answered) |
| [#10](https://github.com/craigcossairt/lanyard/pull/10) | ⚠️ Load generator: stream backoff ignored the run end (overran its hard cap); SIGTERM skipped the attendee `leave` | `.gitar/review/` reliability | Both fixed and tested (exit 143 with 200/200 presence calls) |
| [#24](https://github.com/craigcossairt/lanyard/pull/24) | ⚠️ Security: hiding a question still broadcast its text as the cluster label | `.gitar/review/privacy.md` | Resolved before merge (WS2) |
| [#37](https://github.com/craigcossairt/lanyard/pull/37) | ⚠️ Security: plan-my-day interests uploaded to `/me/prefs` without opt-in | `.gitar/review/privacy.md` | Resolved before merge (WS3) |
| [#42](https://github.com/craigcossairt/lanyard/pull/42) | ⚠️ The fanout SLO counted every channel kind, not the speaker path | Contract §6 | Scoped to `channel_kind="session"`, re-applied to Dash0 |
| [#59](https://github.com/craigcossairt/lanyard/pull/59) | ⚠️ Valkey stream ids collided across channels, so dedupe dropped real messages (SSE rotation fix) | Built-in review | Resolved before merge (WS0) |
| [#62](https://github.com/craigcossairt/lanyard/pull/62) | ⚠️ Security: a LinkedIn URL would store real identity for attendees declared PII-free | `.gitar/review/privacy.md` | Resolved before merge |
| [#84](https://github.com/craigcossairt/lanyard/pull/84) | ⚠️ The CPU-limit budget breaks when `worker` surges alongside `app` during a rollout (4.5 > 4 CPU) | `.gitar/review/kubernetes.md`, `deploy-budget` | Fixed: worker `maxSurge: 0`, worst case exactly 4.0 |
| [#46](https://github.com/craigcossairt/lanyard/pull/46) | 💡 Evidence gave two incompatible Ready latencies for the same pod | Built-in review | Reconciled (container start vs pod creation) |
