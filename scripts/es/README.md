# Elasticsearch prep

Run with Node 22+ from the repo root. No npm install is required. Credentials
come only from `ES_URL` (the HTTPS `.es.` host) and `ES_API_KEY` at runtime:

```sh
node --env-file=.env scripts/es/verify.mjs
node --env-file=.env scripts/es/setup.mjs
node --env-file=.env scripts/es/seed.mjs
node --env-file=.env scripts/es/smoke.mjs
```

Use your gitignored local `.env`, or replace `.env` in these commands with the
existing external credentials file path. Worktree agents must use that external
file at runtime and must not copy it into the worktree.

`verify` lists inference endpoint ids/task types, creates a unique temporary
index, indexes one document via `text` → `semantic` copy, runs semantic search, and deletes the probe index
in a `finally` block. On 2026-11-09, serverless 9.7.0 selected
`.jina-embeddings-v5-text-small` and passed the probe.

`setup` creates the ten contract indices and leaves existing indices alone.
**Development reset only:** `setup.mjs --recreate` lists all ten target indices
and refuses before any ES call. Deleting/recreating them also requires the explicit
`--i-understand-this-deletes-live-data` flag. This erases live questions,
captions, presence and signals; never use it to refresh a running event.
Programmatic callers must also pass `confirmDestructive: true` with `recreate`.
Setup/bulk operations allow longer timeouts; normal
queries have a 2-second timeout. Failures omit bodies, headers and credentials.
Source text fields use `copy_to: "semantic"`; all semantic queries target
`semantic`. New application writes therefore need no client-side embeddings.

`seed` validates ids, references and UTC intervals before writing. Bulk `create`
with stable document ids preserves every existing document (409 means kept),
including session status or room edits made by organizers. Re-running after a
partial failure fills missing documents. A final explicit refresh makes the smoke query
immediately searchable. It does not delete talks removed from a newer snapshot.

The committed snapshot contains 480 public KubeCon talks, 703 public speakers,
28 source rooms, and CNH Demos (2 rooms and 2 concurrent sessions). KubeCon's
venue-local MST timestamps become UTC; both events use `America/Denver`.
CNH Demos starts at 17:30 MST on November 9 (`2026-11-10T00:30:00Z`).

Refresh the public fixture with `node scripts/es/import-schedule.mjs`. The API
URL comes from the [official schedule page](https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/schedule/).
Only public talk/speaker fields are retained; contact links, photos, custom
answers and registration records are excluded. Room capacities and map x/y are
demo fixtures, not official venue data. Accessibility flags are unverified
placeholders and must not be presented as verified routing guidance.

The CNH rooms have capacities 30 and 100; the Side Stage's open Q&A overlaps
the Main Stage placeholder as an overflow destination. Both start scheduled;
organizers add team sessions and control live status later.

`node scripts/es/smoke.mjs --offline` checks the fixture without credentials.
The live smoke fuses event-filtered BM25 multi-match and semantic retrieval
using RRF, checks five results, and prints their public titles for PR evidence.
Standalone prep scripts have no telemetry dependency; application/worker
integration uses WS0's instrumented ES client in the next WS1 slice.
