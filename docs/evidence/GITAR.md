# Gitar evidence

Notable Gitar reviews, rule hits and auto-applied CI fixes.

**Totals (as of 2026-11-09T19:25Z):** 10 PRs opened (#1 to #10); Gitar reviewed every one. Auto-applied CI fix: none yet (to be recorded when incident C happens).

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
