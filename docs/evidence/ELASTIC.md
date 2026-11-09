# Elasticsearch: find the right talk

Elasticsearch is Lanyard's persistent data layer: event graph, sessions,
transcripts, questions, clusters, presence and signals. The seed contains
**480 public KubeCon talks plus two CNH demo sessions**. Attendees can ask for
“eBPF but for security folks”; the top live result is **Beyond Harnesses and
Sandboxes: Runtime Protection for AI Agents with eBPF**.

## One hybrid query, two ways to understand the request

Source fields remain searchable `text` and copy into `semantic_text`:

```json
{
  "title": { "type": "text", "copy_to": "semantic" },
  "abstract": { "type": "text", "copy_to": "semantic" },
  "speakerNames": { "type": "text", "copy_to": "semantic" },
  "semantic": { "type": "semantic_text" }
}
```

The verified serverless default is `.jina-embeddings-v5-text-small`. Writers
index ordinary fields; Elasticsearch creates embeddings automatically. The
session search body uses the same event filter in both retrievers:

```json
{
  "retriever": {
    "rrf": {
      "rank_window_size": 50, "rank_constant": 60,
      "retrievers": [
        { "standard": { "query": { "bool": {
          "filter": [{ "term": { "eventId": "kubecon-na-2026" } }],
          "must": { "multi_match": { "query": "eBPF but for security folks", "fields": ["title^3", "abstract", "speakerNames"] } }
        } } } },
        { "standard": { "query": { "bool": {
          "filter": [{ "term": { "eventId": "kubecon-na-2026" } }],
          "must": { "semantic": { "field": "semantic", "query": "eBPF but for security folks" } }
        } } } }
      ]
    }
  }
}
```

Track, level and UTC interval filters are also applied to both branches.
RRF combines ranks rather than incompatible lexical/vector scores. Plain-text
highlights explain matches. Each ES request has a 2 s timeout and the session
search span is `es.cnh-sessions.search`.

## Measured discoveries beyond keyword matching

Comparisons on 2026-11-09T21:06Z and 21:09Z: identical event filter and BM25
fields; ranks are one-based. One talk has **no lexical match**; two others
disappear from a five-result keyword page while hybrid brings them forward.

| Request | Talk | BM25 rank → hybrid rank |
|---|---|---|
| restrain rogue copilots | Agentic Ops: Building Guardrails for Autonomous AI with Policy-as-Code | No match → 2 |
| stop attackers hiding inside containers | Sandbox Your Agents | 25 → 3 |
| roll back a broken release without waking everyone | GitOps Meltdown: How a Commit Triggered a Cascading Delete of 39 Clusters in Production | 19 → 2 |

## Question merging: measured, deliberately conservative

`findQuestionCluster` performs semantic top-1 retrieval within the same event
and session, excludes the new/hidden question, and reuses the matched cluster
only when its similarity is **≥0.848**. This threshold is a semantic score,
not an RRF score. WS2 owns question and cluster writes.

| Threshold | Correct merges / 10 paraphrases | False merges / 10 distinct questions | Missed paraphrases |
|---|---:|---:|---:|
| 0.800 | 8 | 2 | 2 |
| 0.830 | 3 | 1 | 7 |
| **0.848** | **3** | **0** | **7** |

The selected cutoff minimizes `4 × false merges + missed paraphrases` on 20
synthetic pairs, including same-topic hard negatives. Capacity (0.872), kernel
threat detection (0.893) and GitOps rollback (0.850) paraphrases merge. This is
an **in-sample smoke calibration**, not production accuracy; it favors keeping
distinct attendee questions over aggressive merging. Recalibrate on model
changes. [Inputs](../../data/seed/question-pairs.json),
[measured scores](../../data/seed/question-calibration-results.json),
[reproduce](../../scripts/es/calibrate.ts).

## Plans and answers cite stored evidence

Plan-my-day retrieves at most 50 candidates from the requested event-local
calendar day, with exact UTC day bounds applied **before ranking** (including
23/25-hour DST days). The model may select only those session IDs. Server
validation rejects invented/cross-event/duplicate IDs, caps the plan at eight,
orders it by start time and removes overlaps.

Ask-the-conference retrieves at most 12 transcript/question passages with RRF,
excludes hidden questions, and accepts only exact retrieved
`(sessionId, chunkId)` or `(sessionId, questionId)` citations. Empty evidence
returns an explicit no-answer. Both routes use bounded cached generation and
stop waiting after 7.5 s; the 20 s model call can finish behind the cache.

Live attendee checks at **2026-11-09T21:06Z**, version `a6a80ea`, measured from
the client through `https://lanyard.cnh.radarhq.io`:

| Journey | Response | Client elapsed |
|---|---|---:|
| eBPF search | 200, relevant talk first | 1.317 s |
| Attacker / broken-release discovery queries above | 200 | 0.304 / 0.405 s |
| Cold plan, Nov 10 / runtime security interests | 503 `generation_pending`, `Retry-After: 2` | 7.615 s |
| Same plan after retry delay | 200, eight real IDs, no overlaps | 2.039 s |

Each measured response stayed below 8 s; the cold plan completed in about
11.65 s including the 2 s retry delay. Search/plan/ask route smokes additionally
cover event/role isolation and invalid citations. No private question,
transcript, interest text or credentials are included in telemetry.

[Search implementation](../../apps/api/src/modules/search/search.ts) ·
[plan validation](../../apps/api/src/modules/search/plan.ts) ·
[answer validation](../../apps/api/src/modules/search/ask.ts) ·
[index mappings](../../scripts/es/setup.mjs)
