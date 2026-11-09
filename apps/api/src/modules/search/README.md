# Search and retrieval

`GET /api/events/:eventId/search` requires an event-matching bearer token. It
returns the shared `SearchResponse`. `track` and `level` match exact indexed
values. `from`/`to` are UTC instants selecting sessions overlapping `[from,to)`.
Highlight strings are plain text; render them as text, never as HTML.

WS2 imports `findQuestionCluster` and `lastTranscriptChunks` from `helpers.ts`.
Questions/transcripts must store `eventId` and `sessionId` as contract fields;
Elasticsearch fills `semantic` through `copy_to`. Duplicate lookup excludes the
new question id and hidden questions; WS2 owns every write and cluster update.
Transcript reads return the latest 200 chunks within 1–30 minutes, in seq order.

## Duplicate threshold

Run `node --env-file=<existing-env-file> --import tsx scripts/es/calibrate.ts`.
It uses WS0's instrumented ES wrapper, creates a unique temporary index with the
same semantic mapping, indexes 20 synthetic originals, searches their paired
queries, records only pair ids/scores/labels, and deletes the temporary index.
Public synthetic inputs and measured scores are under `data/seed/question-*`.

On 2026-11-09, `.jina-embeddings-v5-text-small` measured ten paraphrases and ten
distinct questions, including three hard negatives on the same topic. The
selected threshold is **0.848** (unrounded midpoint 0.847880475), minimizing
`4 * false merges + missed duplicates`: zero false merges and seven missed
duplicates on these 20 pairs. It successfully merges the room-capacity,
kernel-threat-detection and GitOps-rollback paraphrases. Distinct questions
about the same subject can score highly; a conservative threshold prevents
silently losing different attendee questions at the cost of more clusters.

This is an in-sample smoke calibration, not a measured production accuracy
claim. The helper returns its score so callers retain evidence. Recalibrate if
the endpoint/model changes; do not reuse this numeric threshold for ELSER or
RRF scores. Empty/incomplete searches never claim a duplicate match.

## Demo recovery (2026-11-09)

The trial inference endpoint returned HTTP 429 with an explicit eight-second
quota refill window. A single-document probe first recovered at
2026-11-09T23:12:29.540Z; it returned no Retry-After or rate-limit headers.
The original overflow group's three scores were 0.8262, 0.7155 and 0.7334,
all below the unchanged 0.848 threshold. Revised wording and measured scores
are in `data/seed/demo-question-*`. Measurements are partial if the endpoint
rejects or times out; do not interpret missing pairs as successful matches.

`scripts/es/demo-pairs.ts` scores isolated synthetic records through the actual
helper and deletes only its own ids. Its CLI-only fetch transport works around
local client transport failures; `--diagnostic-timeout` explicitly allows 15 s
for scoring, separate from the approved production 4 s dedup-only budget. `--resume`
continues measured pairs with ten-second pauses. Background question writes
wait for ES refresh; this does not bypass inference rate limits or guarantee
that every subsequent semantic query completes inside its deadline.
