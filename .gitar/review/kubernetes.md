# Kubernetes conventions
- Every container sets CPU and memory requests and limits. The team budget is 2 CPU / 4 GiB requests and 4 CPU / 8 GiB limits in total, so flag changes that exceed it.
- No privileged pods, hostPath, hostNetwork or hostPID (the cluster refuses them).
- Secrets are referenced via `secretKeyRef` to `app-credentials`, never inlined.
- `deploy/kustomization.yaml` image tags are managed by the deploy bot. Flag manual edits.
