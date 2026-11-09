# Load generator (incident A, "Keynote surge")

`attendees.mjs` simulates up to 300 attendees who join one session, hold its SSE stream open, and ask, vote and signal. It has no dependencies (Node 22+) and never logs tokens or question text; synthetic questions start with `[load]`.

**Hard bounds** (clamped whatever you pass): 300 attendees, 600 s, 100 actions/s across all attendees. The process exits at `DURATION_S + 30` s regardless. Signals respect the contract rate limit (1 per type per 30 s per attendee).

| Env | Default | Meaning |
|---|---|---|
| `TARGET` | `http://app` | Base URL (in-cluster Service, or `https://lanyard.cnh.radarhq.io`) |
| `EVENT_ID` / `JOIN_CODE` | `kubecon-na-2026` / `KUBECON26` | Event to join (the seed's `cnh-demos` / `CNH26` also works) |
| `SESSION_ID` | `kubecon-session-1289969` | Session to load. Avoid the live demo session so `[load]` questions stay off the demo screen |
| `ATTENDEES` | 50 | Virtual attendees (max 300) |
| `DURATION_S` / `RAMP_S` | 120 / 30 | Run length (max 600) / spread of joins |
| `THINK_S` | 8 | Mean seconds between one attendee's actions (exponential) |
| `MAX_RPS` | 40 | Shared cap on all requests per second (max 100) |

Each attendee: `POST /api/events/:id/join` → `POST /api/sessions/:id/presence {kind:join}` → holds `GET /api/sessions/:id/stream?token=` (reconnects with backoff), then loops: 15% ask, 45% vote on a known question, 40% signal; finally `presence {kind:leave}`.

**Partial v1:** a route that returns 404 without a contract error body counts as not built yet; it is skipped for the rest of the run and listed in `notBuiltYet`.

## Output

A JSON progress line every 10 s, then a summary: per-route counts, status codes and p50/p95/p99 latency; SSE opened/reconnects/messages; and **client-observed question fanout** (from the moment the ask is sent to `question.created` arriving on every open stream) against the product SLO (p95 < 1000 ms). Latencies are measured after the generator's own rate limiter. `generatorLoopLagP99Ms` above ~100 means the generator itself is starved, so its numbers are suspect.

## Run it

Self-test without the app:

```sh
node scripts/load/stub-server.mjs          # test fixture on :8099
TARGET=http://localhost:8099 ATTENDEES=300 DURATION_S=30 node scripts/load/attendees.mjs
```

From the laptop against the live URL (goes through the platform's ingress):

```sh
TARGET=https://lanyard.cnh.radarhq.io ATTENDEES=100 DURATION_S=120 node scripts/load/attendees.mjs
```

In the cluster, as a bounded Job (`job.yaml`: 250m/256Mi requests, 500m/512Mi limits, `activeDeadlineSeconds: 720`, uses the public app image). The Job and its ConfigMap are deliberately outside `deploy/`, so Argo CD does not own them:

```sh
kubectl -n team-lanyard create configmap load-script --from-file=attendees.mjs=scripts/load/attendees.mjs
kubectl create -f scripts/load/job.yaml     # bump metadata.name per run: load-002, ...
kubectl -n team-lanyard logs -f job/load-001
kubectl -n team-lanyard delete job load-001  # or let ttlSecondsAfterFinished clean it up
```

If you change the script, recreate the ConfigMap (`kubectl delete configmap load-script`, then the create above). Record each run's summary and what Dash0 and Radar showed in `docs/evidence/INCIDENTS.md`.
