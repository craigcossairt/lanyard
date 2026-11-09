# Radar evidence

How the agents used Radar Cloud (MCP server `radar-cloud`, org "Cloud Native Hackathon") to observe and ship to the `lanyard` vcluster. Cluster id `kdJiSEnVNl0`; every call passes it as `cluster`. We never call `cnh` or another team's cluster.

## Tools available on this connection

`list_clusters`, `fleet_search`, `fleet_issues`, `fleet_list_gitops`, `fleet_list_packages`, plus the hosted AI investigation tools (`start_investigation`, `get_investigation`, `follow_up_investigation`, `list_investigations`, `stop_investigation`).

The per-cluster tools named in AGENTS.md (`get_cluster_audit`, `manage_gitops`, `diagnose`, `get_events`, `wait_for`) are **not** advertised on this connection. So the Checks "before/after" comes from the Radar Cloud UI (screenshots), and Argo CD syncs happen automatically on push (`selfHeal` + `automated`).

## Log

| Time (MT) | Tool | Call | What it showed | Used for |
|---|---|---|---|---|
| 11:33 | `list_clusters` | (none) | 0 clusters, org "Lanyard" (MCP bound to the wrong org) | Fell back to read-only kubectl until Craig re-authenticated |
| 11:48 | `list_clusters` | (none) | Org "Cloud Native Hackathon"; `lanyard` = `kdJiSEnVNl0`, Radar 1.20.1, connected | Cluster id for every later call |
| 11:49 | `fleet_list_gitops` | `kind=applications, cluster=kdJiSEnVNl0, namespaces=team-lanyard` | Application `app`: Synced to `8e41d5f`, Healthy, last op Succeeded 18:48:26Z | Verify the PR #1 deploy (ship skill, step "synced revision") |
| 11:49 | `fleet_search` | `q="kind:Pod ns:team-lanyard", include=summary` | 2/2 `app` pods Running 1/1 on image `ghcr.io/craigcossairt/lanyard:f8c3220` | Verify the live workload runs the new build |
| 11:49 | `fleet_issues` | `cluster=kdJiSEnVNl0, namespace=team-lanyard` | 0 issues | Baseline "before" for the team namespace |

The URL check alongside: `https://lanyard.cnh.radarhq.io/` served `version f8c3220` at 11:49.

## Checks (audit) before / after

- **Before:** to capture as a Radar Cloud UI screenshot (Checks, namespace `team-lanyard`) before PR #2 (Valkey + Secret wiring) deploys. `get_cluster_audit` isn't on the MCP connection.
- **After:** after PR #2 and the worker + HPA PR. Expected wins: requests/limits on every container, non-root, read-only root fs on Valkey, no service-account token automount on Valkey and worker.
