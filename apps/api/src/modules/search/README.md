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
