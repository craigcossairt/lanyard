---
title: "API contract sync"
description: "Keep contracts doc and web client in sync with API changes"
type: check
when: "PRs that change routes, request/response shapes or realtime message types under apps/api/src/modules/ or packages/contracts/"
actions: "Request changes naming the route or message"
---

# API contract sync

When a pull request changes files under `apps/api/src/modules/` or `packages/contracts/` in a way that adds, removes or changes a route, request/response shape, or realtime message type:
- verify that `docs/plan/02-contracts.md` is updated in the same pull request, and
- verify that the web client usage under `apps/web/src/` is updated or still compatible.
If either is missing, request changes and name the specific route or message.
