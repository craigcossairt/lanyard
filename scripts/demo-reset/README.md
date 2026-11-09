# Demo reset (CNH Demos only)

`scripts/demo-reset.mjs` wipes the live state of every `cnh-demos` session before a recording. Each run resets **all** CNH Demos sessions, including team sessions added live.

- Transcript chunks (ES `cnh-transcripts`, plus the Valkey caption tail and seq counter).
- Questions, clusters and votes (ES `cnh-questions`, plus the Valkey hashes, voter sets and `questions:{sid}:count`).
- Signal zsets and rate limits.
- Presence member sets: `session:*` and `room:*`, plus `attendee:*:at` where it points at a CNH session.
- Reroute suggestions from CNH rooms.
- The catch-up cache and the sessions' SSE replay buffers.

Afterwards it publishes clearing messages (`question.updated` as hidden, `cluster.updated` with size 0, `attendance.updated` with count 0, an empty `signals.window`), so open screens drop those items.

**Captions have no clearing message, and since #59 a rotating stream resumes without a new snapshot. Reload the recording screens after a reset.**

It **refuses any event other than `cnh-demos`** (`--event=…` exits with status 2). It's a **dry run by default** and prints counts only; `--apply` wipes. It never prints text.

## Run it (in-cluster: the Valkey part needs it)

The cluster's Valkey can only be reached from inside the cluster, so this runs as a one-off Job in the app image, with the script mounted from a ConfigMap. Argo CD neither owns nor prunes either of them.

1. Create or update the ConfigMap from this repo's script. With kubectl:
   `kubectl -n team-lanyard create configmap demo-reset-script --from-file=demo-reset.mjs=scripts/demo-reset.mjs --dry-run=client -o yaml | kubectl apply -f -`
   Or ask your agent to apply the same ConfigMap through Radar `apply_resource`.
2. Dry run: apply `job.yaml` with the name changed to `demo-reset-dry-NNN` and `--apply` removed from `command`. Read the logs (Radar `get_workload_logs`, kind `job`).
3. Wipe: apply `job.yaml` with a new name (`demo-reset-NNN`), wait for it to complete, and read the counts in the logs.
4. Reload `/a/s/cnh-demos-opening`, the speaker console and the ops board.

## Run it locally (ES only)

`node --env-file=<path to .env> scripts/demo-reset.mjs [--apply]` from the repo root. Without `VALKEY_URL` (or with a local Valkey) it only resets ES and your local Valkey, not the cluster's live state.
