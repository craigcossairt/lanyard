---
title: "Deploy resource budget"
description: "Total resource requests/limits against the team budget"
type: check
when: "PRs changing files under deploy/"
actions: "Comment with resource totals vs budget"
---

# Deploy resource budget

When a pull request changes files under `deploy/`, sum the resource requests and limits across all workloads and comment with the totals against the budget (2 CPU / 4 GiB requests, 4 CPU / 8 GiB limits).
