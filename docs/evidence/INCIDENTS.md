# Incident evidence

One entry per drill or real incident (see `docs/plan/06-demo.md`). All times are UTC (2026-11-09); MT = UTC−7.

| # | Time (UTC) | What broke | How we noticed (Dash0 / Radar link) | Root cause | Fix (PR / commit) | Time to recover |
|---|---|---|---|---|---|---|
| B | 21:16 → 21:44 found; fix in progress | Every live SSE stream on the public URL dies about 15 s after opening (`ERR_HTTP2_STREAM_ERROR` / `ERR_HTTP2_PROTOCOL_ERROR`), so every phone reconnects and refetches its snapshot about 3 times a minute per stream | WS4/WS3 saw clients drop; [Dash0 stream spans](https://app.dash0.com/goto/traces/explorer?dataset=default&from=2026-11-09T19%3A58%3A56.017Z&to=2026-11-09T21%3A28%3A56.017Z&filter=%5B%7B%22key%22%3A%22service.name%22%2C%22operator%22%3A%22is%22%2C%22value%22%3A%22lanyard-app%22%7D%2C%7B%22key%22%3A%22otel.span.kind%22%2C%22operator%22%3A%22is%22%2C%22value%22%3A%22SERVER%22%7D%2C%7B%22key%22%3A%22url.path%22%2C%22operator%22%3A%22matches%22%2C%22value%22%3A%22%5E%2Fapi%2F%28sessions%2F%5B%5E%2F%5D%2B%7Cevents%2F%5B%5E%2F%5D%2B%2Fops%29%2Fstream%24%22%7D%5D) end at 15.000 s; [Agent0](https://app.dash0.com/goto/agent0?thread_id=d7882930-2683-4aaa-9923-1b9ff31d1a0f&dataset=default&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f) confirmed | The platform's Envoy Gateway applies a fixed **15 s total (route) timeout** to every response, so long-lived SSE is cut. It isn't an idle timeout: traffic every 3 to 4 s didn't extend it | WS0: clean server-side recycle before 15 s, `id:` plus `Last-Event-ID` replay, short `retry`, cheap resume (no heartbeat-only fix). Platform ask: `timeouts.request: 0s` for the stream routes | Pending WS0's PR |
| A | 22:19:30 → 22:24:42 (drill) | Under 300 simulated attendees, question fanout p95 rose from about 515 ms to **2.6 s** (SLO p95 < 1 s **failed**), and `POST …/questions` p95 reached 2.6 s | Load Job summary, Radar `top_resources` / `query_prometheus` / `get_events`; [Agent0](https://app.dash0.com/goto/agent0?thread_id=da11c6f9-d874-4bd8-921d-6f0ab198b23f&dataset=default&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f), [Radar investigation](https://app.radarhq.io/c/kdJiSEnVNl0/investigations/chat_Rr5cLfgdH-sMwJ0u?org=org_NCJbssDGEBsU) | **Ask path waits on an Elasticsearch dedup search before it publishes.** At 22:23Z every `es.cnh-questions.search` timed out at 2.3 to 2.8 s, probably under write pressure from re-indexing each question on every vote (about 21 writes/s). Contributing: the HPA-added pods got no SSE connections | Proposed to the orchestrator (not shipped yet) | n/a (drill) |

---

## Incident B: SSE streams cut at 15 s by the platform gateway

### Symptom

On `https://lanyard.cnh.radarhq.io`, `GET /api/sessions/:id/stream` (and `/api/events/:eventId/ops/stream`) answer 200, deliver `ready` + `snapshot`, then die about 15 s later. WS4 saw it at 21:16:41→56Z and 21:17:00→15Z.

### Evidence

1. **Public vs in-cluster** (`scripts/load/stream-lifetime.mjs`, PR #50):

   | Path | Open for | End | Heartbeats (15 s) |
   |---|---|---|---|
   | Public URL, 3 runs | 16.4 to 16.5 s | `ERR_HTTP2_STREAM_ERROR` | 0 |
   | In-cluster, `kubectl port-forward svc/app` | 70 s, still open (client stopped) | n/a | 4 |

2. **Idle or total timeout?** At 21:4xZ, attendee A held the stream while attendee B toggled presence on the same session every few seconds, which pushes `attendance.updated` to A:

   | Event period | Largest gap between events | Stream open for | End |
   |---|---|---|---|
   | 4 s | 4.3 s | 16.7 s | `ERR_HTTP2_STREAM_ERROR` |
   | 3 s | 3.0 s | 15.4 s | `ERR_HTTP2_STREAM_ERROR` |

   Regular traffic does **not** keep the stream alive, so this is a **total-duration route timeout, not an idle timeout**. A faster heartbeat alone would not fix it. The orchestrator corrected WS0's plan on the strength of this.

3. **Dash0, server side:** `lanyard-app` SERVER spans for the stream routes end at **15.000 s ± 0.011 s** for browser, curl and node clients, on both pods. Status is 200 and UNSET: the app sees a clean close when the proxy tears the connection down.

4. **Agent0** ([thread](https://app.dash0.com/goto/agent0?thread_id=d7882930-2683-4aaa-9923-1b9ff31d1a0f&dataset=default&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f)), verdict: *"Confirmed. Something outside lanyard-app is cutting these streams at a fixed 15 s."*
   - **53 of 69** successful gateway-routed streams ended in 14.992 to 15.013 s; **0** lasted longer than 15.1 s; the one port-forwarded stream ran 70.06 s.
   - A browser cycles every **about 19.3 s** (15 s open, then about 4.3 s until it reconnects): about **3.1 reconnects per minute per stream**, with **about 22% of the time disconnected**. One browser held 3 parallel streams for the same session.
   - Agent0 recommended:
     1. The platform turns off the request timeout on the stream routes (HTTPRoute `timeouts.request: 0s` or an Envoy Gateway `BackendTrafficPolicy`).
     2. The app sends `id:` on every event, replays from `Last-Event-ID`, and sets `retry: 1000`.
     3. A server-side recycle before 15 s as a stopgap.
     4. Move the heartbeat off 15 s.
     5. Investigate the 3 streams per browser.

### Fix

- **WS0 (in progress):** a clean server-side recycle at about 12 s, `Last-Event-ID` replay, a short `retry`, and a cheap resume.
- **Platform team:** raise or disable the gateway route timeout for the stream paths. That is the real fix, but we can't change it ourselves: the HTTPRoute in `deploy/` has no effect in this cluster (AGENTS.md).
- **After the fix, check:** the reconnect cadence per stream (Dash0 span durations) and that no events are lost across a recycle.

---

## Incident A: "Keynote surge" load drill (bounded, real)

### Setup

- Job `load-001`, created through Radar MCP `apply_resource` at 22:19:30Z.
- Image `lanyard:latest`; script from ConfigMap `load-script` (`scripts/load/attendees.mjs`).
- **Target:** in-cluster `http://app.team-lanyard.svc`, so this load does **not** cross the gateway from incident B.
- **Shape:** 300 attendees on `kubecon-session-1289969` (not the demo session), 300 s run, 60 s ramp, at most 40 requests/s, mean think time 8 s.
- **Job resources:** requests 250m/256Mi, limits 500m/512Mi, `activeDeadlineSeconds: 720`. It completed at 22:24:42Z.

### What the generator measured

| Route | n | Status | p50 | p95 | p99 (ms) |
|---|---|---|---|---|---|
| join | 300 | 201 | 5 | 379 | 2332 |
| presence | 600 | 200 | 12 | 395 | 566 |
| stream (open) | 300 | 200 | 13 | 268 | 387 |
| ask (`POST /questions`) | 1451 | 201 | 389 | **2646** | 2799 |
| vote | 4413 | 200 | 136 | 378 | 493 |
| signal | 3917 | 200 | 108 | 317 | 405 |

- **Streams:** 300/300 opened, **0 reconnects** (in-cluster), **4,672,792 SSE messages** in 307 s: about 15,600 messages/s in total, **about 52 per client per second**.
- **Question fanout** (ask sent → `question.created` on every stream), n = 414,470, reservoir-sampled: p50 339 ms, **p95 2625 ms**, p99 2794 ms. **SLO (p95 < 1000 ms): FAIL.**
- **Timeline:** p95 was 234 to 290 ms during the ramp, about 515 ms at steady state with 300 attendees (until t≈220 s), then **2.39 to 2.63 s from 22:23:23Z** to the end.
- **Generator loop lag, p99: 188 ms**, over the 100 ms trust line. From about 22:22:45Z the generator itself was at its CPU limit, so the late part of the run includes client-side delay.

### What Radar showed (MCP)

- **`get_events`:** at 22:21:15Z, `SuccessfulRescale` "New size: 4; reason: cpu resource utilization (percentage of request) above target", then `Scaled up replica set app-6654f949f8 from 2 to 4`. The new pods were Ready by 22:21:26 to 28Z.
- **`top_resources` and `query_prometheus` (`container_cpu_usage_seconds_total`, CFS throttling):**

  | Pod | CPU (limit 500m) | CFS throttled |
  |---|---|---|
  | `app-…-h2kjp` (original) | about 0.33 | 27% |
  | `app-…-7qrt9` (original) | about 0.33 | 18% |
  | `app-…-mnws5`, `…-vlhsb` (HPA-added) | about 0.01 | under 1% |
  | `load-001` (generator) | 0.47 to 0.50 | 90% |
  | `valkey` | about 0.02 | 2% |
  | `worker` | about 0.003 | 0 |

- **No OOM, no restarts, 0 Radar issues.** Memory peaked at about 110 MiB per app pod (limit 512 MiB).

### Agent0: why did question fanout p95 regress? (root cause)

[Thread `da11c6f9`](https://app.dash0.com/goto/agent0?thread_id=da11c6f9-d874-4bd8-921d-6f0ab198b23f&dataset=default&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f), started 22:32Z. Agent0 correlated spans, `http.server.request.duration`, `conf.realtime.fanout_ms` and the ES and Valkey client spans:

> "Question fanout regressed because the ask endpoint waits on an Elasticsearch dedup search before it publishes to Valkey. From 22:23:00–22:23:20 every one of those searches timed out at about 2.3–2.8 s, so each question reached clients that much later. Valkey, the session channel and the generator account for little of the 2.6 s."

Example trace `5daefec5a09af31922bcc1bf747fc9ec` (2.77 s): `POST /api/sessions/:id/questions`, then `es.cnh-questions.search` (dedup) **blocks 2.76 s and ends in an undici `Headers Timeout Error`**, and only then do the Valkey `multi`/`exec`/`hset`/`lpush`/`publish` run (about 2 ms in total).

| | 22:19:30–22:23:20 | 22:23:20–22:25:00 |
|---|---|---|
| Ask route, server p95 | 0.27–0.42 s | **2.53–2.64 s** |
| Asks over 1 s | 82 of 1,081 | **370 of 370** |
| `es.cnh-questions.search`, average | about 150 ms | **about 2.3 s (all time out)** |
| `es.cnh-questions.index`, average / errors | about 400 ms / about 1% | **about 2.4 s / 100%** |
| `es.cnh-signals.index` (same ES cluster), average | about 280 ms | about 340 ms (healthy) |
| Valkey `publish`, average | 7.4 ms | 7.3 ms |
| Server fanout p95 / p99 (session channel) | ≤ 59 / ≤ 168 ms | 23–47 / 70–95 ms |

- **Server vs generator:** the server-side ask p95 (about 2.6 s) plus Valkey→SSE fanout (about 50 to 90 ms) accounts for the client's 2,625 ms. The generator's starvation adds at most about 100 ms, and the jump (about 22:23:10) lines up with the ES break, not with the generator's throttling (22:22:45).
- **Why ES saturated** (partly inference: we can't see ES's own metrics): every vote re-PUTs the whole question document into `cnh-questions` with an external version (versions 1 to 9+ seen). That makes the write rate to that index **asks plus votes, about 21 per second**, against about 4.7 asks per second. Question-index latency was already climbing from 265 to 553 ms in the first minute. Only that index failed.

**My initial hypothesis was wrong, and Agent0 corrected it.** I had suspected session-channel fanout amplification (about 52 messages/s per client). Agent0 showed server fanout stayed at p95 ≤ 60 ms and Valkey `publish` held at about 7 ms, so message volume is **not** the bottleneck.

### Findings and proposed fixes (sent to the orchestrator; WS2 or WS5 implement them)

1. **Take ES dedup out of the publish path** (WS2): publish first and dedup asynchronously in the worker (optimistic UI, as `06-demo.md` suggests), or bound the dedup search to about 200 ms and skip dedup on timeout. This alone makes fanout independent of ES.
2. **Stop re-indexing the question on every vote** (WS2): keep vote counts in Valkey and bulk-write or partially update ES periodically. That removes about three-quarters of the writes to `cnh-questions`.
3. **Spread SSE connections across pods** (WS0 / WS5): the HPA scaled 2 → 4 correctly, but the new pods got no streams. Incident B's server-side recycle (about every 12 s) rebalances connections onto new pods as a side effect.
4. **Harness:** at 500m the generator saturated after about 220 s (loop lag p99 188 ms). For the re-run, use two Jobs of 150 attendees, or a 1-CPU limit with the app pinned below 4 replicas, to stay within the 4-CPU limits budget.

### Radar hosted investigation

[`chat_Rr5cLfgdH-sMwJ0u`](https://app.radarhq.io/c/kdJiSEnVNl0/investigations/chat_Rr5cLfgdH-sMwJ0u?org=org_NCJbssDGEBsU) on Deployment `team-lanyard/app`, started 22:32:49Z, about 8 minutes after the drill ended.

- **First verdict (22:34Z):** "The app Deployment is healthy: both pods are ready and the latest rollout completed successfully." `healthy: true`, `certainty: established`, `confidence: 0.9`. The restart chart for the hour was flat at zero, there were 0 live issues, and the one startup-probe blip at 22:31:18Z was a rollout race (the app was listening by 22:31:19.966Z).
- **What this shows:** the cluster absorbed the surge with no crash, OOM or restart, and recovered on its own. The latency root cause sits in Elasticsearch, outside Kubernetes, which is why Agent0 (spans) found it and Radar (cluster state) didn't. The two tools are complementary.
- **Follow-up** (22:43Z, aimed at the drill window, the HPA and the CFS throttling): *(pending, added when it lands)*.

### Re-run

To do after fixes 1 and 2 ship, with the generator resized. Compare fanout p95, the ES question-index latency and the per-pod CPU spread.
