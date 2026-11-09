# Radar evidence

How the agents used Radar Cloud (MCP server `radar-cloud`, org "Cloud Native Hackathon") to observe and ship to the `lanyard` vcluster. Cluster id `kdJiSEnVNl0`; every call passes it as `cluster`. We never call `cnh` or another team's cluster.

## Tools available on this connection

`list_clusters`, `fleet_search`, `fleet_issues`, `fleet_list_gitops`, `fleet_list_packages`, plus the hosted AI investigation tools (`start_investigation`, `get_investigation`, `follow_up_investigation`, `list_investigations`, `stop_investigation`).

The per-cluster tools named in AGENTS.md (`get_cluster_audit`, `manage_gitops`, `diagnose`, `get_events`, `wait_for`) are **not** advertised on this connection. So the Checks "before/after" comes from the Radar Cloud UI (screenshots), and Argo CD syncs happen automatically on push (`selfHeal` + `automated`).

## Log

| Time (UTC) | Tool | Call | What it showed | Used for |
|---|---|---|---|---|
| 2026-11-09T18:33Z | `list_clusters` | (none) | 0 clusters, org "Lanyard" (MCP bound to the wrong org) | Fell back to read-only kubectl until Craig re-authenticated |
| 2026-11-09T18:48Z | `list_clusters` | (none) | Org "Cloud Native Hackathon"; `lanyard` = `kdJiSEnVNl0`, Radar 1.20.1, connected | Cluster id for every later call |
| 2026-11-09T18:49Z | `fleet_list_gitops` | `kind=applications, cluster=kdJiSEnVNl0, namespaces=team-lanyard` | Application `app`: Synced to `8e41d5f`, Healthy, last op Succeeded 2026-11-09T18:48:26Z | Verify the PR #1 deploy (ship skill, step "synced revision") |
| 2026-11-09T18:49Z | `fleet_search` | `q="kind:Pod ns:team-lanyard", include=summary` | 2/2 `app` pods Running 1/1 on image `ghcr.io/craigcossairt/lanyard:f8c3220` | Verify the live workload runs the new build |
| 2026-11-09T18:49Z | `fleet_issues` | `cluster=kdJiSEnVNl0, namespace=team-lanyard` | 0 issues | Baseline "before" for the team namespace |
| 2026-11-09T18:56Z | `fleet_list_gitops`, `fleet_search` | same as above | `app` Synced to `b2917c4`, Healthy; 2/2 pods on `1f80ab7` | Verify the #3 deploy |
| 2026-11-09T19:19Z | `fleet_list_gitops` | same as above | Synced to `9d35e73` (the #4 docs merge), not yet the #2 deploy commit `74ca0ac` | Argo hadn't polled yet, so we waited instead of declaring it deployed |
| 2026-11-09T19:20Z | `fleet_list_gitops` | same as above | Synced to `74ca0ac`, health **Progressing**, then **Healthy** at 19:20:43Z; resource count 3 → 5 | Verify the #2 deploy (Valkey + Secret wiring) |
| 2026-11-09T19:20Z | `fleet_search` | `q="ns:team-lanyard"`, CEL `filter: kind == "Pod" \|\| kind == "Deployment" \|\| kind == "Service"` | `app` 2/2 on `b1b0e69`; `valkey` 1/1 (`Recreate`), first seen `ContainerCreating` while the image pulled; Services `app:80`, `valkey:6379` | Confirm the new workload and that every `secretKeyRef` resolved (pods would sit in `CreateContainerConfigError` otherwise) |
| 2026-11-09T19:20Z | `fleet_issues` | same as above | 0 issues | No regressions after #2 |
| 2026-11-09T19:28Z | `fleet_list_gitops` | same as above | Synced to `b37bd5a` (deploy commit for WS0's skeleton #5), Healthy, last op Succeeded 19:26:30Z | Verify the monorepo skeleton deploy |
| 2026-11-09T19:28Z | `fleet_search` | `q="ns:team-lanyard"`, CEL `kind == "Pod" \|\| kind == "Deployment"` | `app` 2/2 on `ghcr.io/craigcossairt/lanyard:63f928d` (new pods, 1 min old); `valkey` 1/1 | The new one-image build runs as `ROLE=app` |
| 2026-11-09T19:37Z | `fleet_list_gitops`, `fleet_search`, `fleet_issues` | same as above | Synced to `7596c48` (#10's merge commit), Healthy, last op 19:36:49Z; `app` 2/2 on `51317cf` (#7, API core with OTel); 0 issues | Verify #6 and #7. A newer deploy commit `99eae61` (image `7596c48`) was already on `main`, so we waited for it |
| 2026-11-09T19:39Z | `fleet_list_gitops`, `fleet_search` | same as above | Synced to `99eae61`, Healthy, last op 19:38:02Z; `app` 2/2 on `7596c48` (fresh pods); `valkey` 1/1, untouched for 19 min | Verify the current head of `main` |
| 2026-11-09T19:42Z | `fleet_list_gitops` | same as above | Synced to `76d7b8a` (includes #15), Healthy, last op 19:41:05Z; **resource count 5 → 8** (worker Deployment, worker Service, HPA) | Verify #15: worker + HPA |
| 2026-11-09T19:42Z | `fleet_search` | `q="ns:team-lanyard"`, CEL `kind == "Pod" \|\| kind == "Deployment" \|\| kind == "HorizontalPodAutoscaler" \|\| kind == "Service"` | `worker` 1/1 on `340cbef`; HPA `app` min 2, max 4 (snapshot: current 1, desired 2); `app` 2/2; Services `app`, `valkey`, `worker:80` | The worker starts with `ROLE=worker`; the HPA owns the `app` replica count |
| 2026-11-09T19:47Z | `fleet_issues` | `cluster=kdJiSEnVNl0, namespace=team-lanyard` | 0 issues | No regressions after #15 (worker + HPA) |

URL checks alongside: `https://lanyard.cnh.radarhq.io/` served `version f8c3220` at 18:49Z, `1f80ab7` at 18:56Z and `b1b0e69` at 19:20Z. At 19:28Z, after the skeleton, `/healthz` returned `{"status":"ok","role":"app","version":"63f928d"}` and `/readyz` returned 200. At 19:37:50Z `/healthz` showed `51317cf`, and at 19:39:06Z it showed `7596c48`. Cross-check in Dash0 (MCP `getLogRecords`, `service.name` starts with `lanyard`): `lanyard-app` logs arrive tagged `service.version` = `51317cf`, then `7596c48` ("Server listening"), so the version from the image tag flows through `OTEL_RESOURCE_ATTRIBUTES` end to end. The Valkey pod events (kubectl, because the per-cluster `get_events` tool isn't on this connection) show the Docker Hub pull succeeded in 29.7 s with no rate limit, plus one expected readiness failure at start-up before Valkey bound its port.

**#15 details** (kubectl, because the per-cluster HPA and events tools aren't on this connection, 19:42Z): the HPA reads `cpu: 3%/60%` with 2 replicas (metrics flowing, not `<unknown>`), and one HPA event at 19:41:02Z, `SuccessfulRescale` "New size: 2; reason: Current number of replicas below Spec.MinReplicas". That is the predicted dip when Argo removed `replicas` from the `app` Deployment, and the HPA restored the minimum within seconds. All four pods show 0 restarts. In Dash0, `lanyard-worker` logs arrive tagged `service.version` = `340cbef`.

## Radar AI investigation: all-clear after a release

- **Run:** [`chat_RjOgOymzUJCDCUUF`](https://app.radarhq.io/c/kdJiSEnVNl0/investigations/chat_RjOgOymzUJCDCUUF?org=org_NCJbssDGEBsU), started 2026-11-09T19:38:14Z by the orchestrator (Craig approved) on Deployment `team-lanyard/app`, right after #7 (API core with OTel) rolled out. Read through MCP `get_investigation` at 19:43Z: status `done`, finished 19:39:47Z.
- **Finding:** "Deployment app is healthy now: the rollout to a new image finished and both replicas are ready with no restarts." `healthy: true`, `certainty: established`, `confidence: 0.92`, `inconclusive: false`.
- **What it worked through:** its first evidence bundle landed mid-rollout (four image tags `63f928d` → `f1f876d` → `51317cf` → `7596c48` within 5 minutes), with a surge pod's readiness and liveness probes reporting "connection refused". It re-read that pod (Running/Ready, 0 restarts), saw the probe warnings stop once the container bound :8080, and confirmed the Deployment's `Progressing` condition: "ReplicaSet has successfully progressed".
- **Caveat it stated:** health is established at the time of the check only. Probe warnings outside a deploy window, or accumulating restarts, would warrant a fresh look.
- **What we learned and did:** the verdict matches our own Radar reads (`fleet_issues` = 0 at 19:37Z and at 19:47Z, after #15 deployed), so the rapid multi-PR release train didn't destabilize `app`. But the investigation surfaced a real, cheap improvement: readiness and liveness fire before the process listens. We added a `startupProbe` (`httpGet /healthz`, every 2 s, up to 30 tries = 60 s) to `app` and `worker` in [#23](https://github.com/craigcossairt/lanyard/pull/23), citing this run. Closing the loop: after #23 deploys, a follow-up on the same run asks "after adding startupProbe, do the probe warnings still occur during rollouts?"; the answer gets recorded here.

## Checks (audit) before / after

`get_cluster_audit` isn't on this MCP connection, so Checks come from the Radar Cloud UI.

### Before: 2026-11-09T19:20Z (12:20 MT), all namespaces, platform-managed hidden

![Radar Checks before](radar-checks-before.png)

**14 checks, 45 actionable, 370 of 418 passing: 0 critical, 1 high, 13 medium.** (Taken just after #2 deployed Valkey, so Valkey's hardening is already in the baseline. The cutoff for a pre-#2 screenshot was missed.)

Which findings are ours? Each one is mapped to a workload from the live pod specs (kubectl, 19:30Z):

| Check (severity, count) | Our workloads in `team-lanyard` | Platform (pre-installed; leave alone per AGENTS.md) | Plan |
|---|---|---|---|
| Privilege escalation (High, 1) | none: `app` and `valkey` set `allowPrivilegeEscalation: false` | `monitoring/prometheus-server` | Not ours |
| Service account token auto-mount (Medium, 10) | `app` | Argo CD, Rollouts, CNPG, Prometheus, Radar, CoreDNS | Fix `app`; worker ships with `false` |
| Read-only root filesystem (Medium, 2) | `app` | `prometheus-server` | Fix `app` (emptyDir `/tmp`) |
| Missing PodDisruptionBudget (Medium, 1) | `app` | | Add PDB `minAvailable: 1` |
| Missing topology spread (Medium, 1) | `app` | | Add a soft spread by hostname |
| Single replica (Medium, 8) | `valkey` (by design) | Platform controllers | Accepted: one Valkey = one pub/sub bus; ES is the record |
| Workload managed by Helm but not GitOps (9), missing probes (3+3), missing CPU/memory requests or limits (1 each), unused ConfigMap/Secret (3) | none: every one of our containers has probes, requests and limits, and is GitOps-managed | Argo CD, Prometheus sidecar, `default/kubeconfig` (kept: kubectl access) | Not ours |

### After

Recorded after the worker + HPA PR and the Checks-fix PR deploy (screenshot plus the same table).
