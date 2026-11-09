# Cluster labels

WS2 calls `runJob('cluster-label', { questions: string[] })` through core/jobs
(or the internal `POST /jobs/cluster-label` worker endpoint). Send 1–20 question
strings, each at most 500 characters; extra event/session/cluster fields are
ignored. The result is `{ label: string }`, a single line of 1–80 characters.
WS2 stores it and publishes its cluster update. This job makes no ES writes.

Uses core `llm()` with `model: 'fast'` (`LLM_MODEL_FAST=gpt-5.4-mini`), a 20 s
timeout and `llm.cluster-label` span carrying model/token usage only. A bounded
60 s cache coalesces identical work; at most four generations run concurrently.
No question text, label text, credentials or caller identities are logged.

Call asynchronously from the attendee request path and store the result when
the job resolves; do not make a live question submission wait up to 20 seconds.
