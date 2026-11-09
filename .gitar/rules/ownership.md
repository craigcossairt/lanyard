---
title: "Workstream folder ownership"
description: "Flag edits outside a workstream's owned folders"
type: check
when: "PRs from ws<N>/ branches that modify folders owned by another workstream"
actions: "Comment listing out-of-scope files"
---

# Workstream folder ownership

When a pull request from a branch named `ws<N>/...` modifies folders owned by a different workstream (see the ownership table in `docs/plan/02-contracts.md` section 1), comment with the list of out-of-scope files and ask for explicit orchestrator approval in the PR description.
