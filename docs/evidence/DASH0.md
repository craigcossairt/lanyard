# Dash0 evidence

Assets as code: `docs/evidence/dash0/` (applied through the Dash0 API, PR #42).

- **Dashboard "Conference Ops":** https://app.dash0.com/goto/dashboards?dashboard_id=ddc340ad-572f-488f-ab26-0904862c8d32&dataset=default&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f
- **SLO, question fanout under 1 s** (session channel, 95%): https://app.dash0.com/goto/alerting/slos/details?slo_id=slo_01m70z1v61e1tvvedxyjh3jppm&dataset=default&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f
- **SLO, rooms under 90% capacity** (95% of room-time): https://app.dash0.com/goto/alerting/slos/details?slo_id=slo_01m70z1vepf5zr31vkzkjahe2k&dataset=default&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f
- **Agent0 investigations:**
  - SSE 15 s cut: [d7882930](https://app.dash0.com/goto/agent0?thread_id=d7882930-2683-4aaa-9923-1b9ff31d1a0f&dataset=default&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f)
  - Drill fanout regression: [da11c6f9](https://app.dash0.com/goto/agent0?thread_id=da11c6f9-d874-4bd8-921d-6f0ab198b23f&dataset=default&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f)
  - Crash loop: [01362a6d](https://app.dash0.com/goto/agent0?thread_id=01362a6d-f19d-4279-97b5-81eb5cc6180c&dataset=default&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f)

## Domain metrics proof: timed overflow → reroute (WS4, build `10444c2`)

The window is 2026-11-09T21:47:40Z → 21:49:34Z, on event `cnh-demos`. The scenario ran 40 virtual attendees plus 1 real attendee. Values were read through the Dash0 MCP `promql`. Leader-emitted gauges are aggregated with `max` (WS4).

**Counters** (raw cumulative value; first emission from 0):

| Metric | `room` | Reading at 21:51Z | Expected |
|---|---|---|---|
| `conf.reroute.suggested` | `cnh-main-stage` | **34** | +34 (the reroute POST at 21:48:38.98Z) |
| `conf.reroute.accepted` | `cnh-main-stage` | **1** | +1 (the real attendee accepted at 21:49:01.8Z) |

Before the test, at 21:27Z, neither series existed in Dash0. `increase()` over 3 minutes reads 38.1 and 1.15; that's Prometheus extrapolation over a short window, not extra events.

**Room occupancy**, `max by (room) (conf.room.occupancy)`, 15 s steps. Capacity is Main Stage 30, Side Stage 100.

| UTC | 21:47:45 | 21:48:00 | 21:48:15 | 21:48:30 | 21:48:45 | 21:49:00 | 21:49:15 | 21:49:30 |
|---|---|---|---|---|---|---|---|---|
| Main Stage | 1 | 1 | **35 (117%)** | 34 | 34 | 33 | 29 | 6 |
| Side Stage | 0 | 0 | 6 | 7 | 7 | 8 | **9** | 7 |

This matches WS4's timeline:
- The simulator started at 21:47:53.3Z, and the overflow alert opened at 21:47:59.6Z (peak 35/30).
- 34 suggestions went to `cnh-demos-hallway` (Side Stage); the attendee saw one 367 ms later.
- The attendee accepted and landed in Side Stage at 21:49:04.4Z.
- The simulator stopped at 21:49:07.4Z, and the overflow resolved at 21:49:19.4Z.

The rooms-under-90% SLO counted the Main Stage room-time above 0.9 between 21:48:15 and 21:49:15 as bad events.

**Dashboard view of the spike** (for a screenshot): https://app.dash0.com/goto/dashboards?dashboard_id=ddc340ad-572f-488f-ab26-0904862c8d32&dataset=default&from=2026-11-09T21:46:30.000Z&to=2026-11-09T21:51:00.000Z&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f
