# Design brief for the grill-design session (start at about 11:20, deliver by 13:30)

Paste this into a new T3 thread on the repo. The repo includes Trellis's `grill-design` skill: build several genuinely different working prototypes, compare them side by side, and lock decisions in rounds.

## Context
**Lanyard** is a conference platform with role-specific views on one live event graph. Read `docs/plan/01-PRD.md` (personas, P0 features) and `docs/plan/02-contracts.md` (data, realtime messages).

Judges see it **on their own phones within seconds of scanning a QR** and on a projector, so first impressions are everything. Its Merge Forward entry means accessibility must be visibly excellent, not just compliant.

## Surfaces, in priority order
1. **Attendee live session (phone).** This is the hero. Captions as the centrepiece. Ask box. Merged question list with "you and 13 others" feedback. Signal buttons (slower, louder, can't see, lost me, 👍). Catch-me-up sheet.
2. **Speaker console (laptop and projector).** Big-type stage mode. Question clusters ranked. Signal meter. Attendance. Start-captions control. Must read from 10 metres away.
3. **Organizer ops board (laptop, dense).** Rooms as "services" with SLO states, an alert feed with a one-click reroute, and ask-the-conference. It should feel like an SRE console, so its look should resonate with the Dash0 and Radar judges.
4. Attendee home, search and plan-my-day (phone).
5. Join flow: QR, then you're in, in 1 tap. No account and no form.
6. Vendor and venue (P1/P2): reuse the organizer patterns.

## Constraints
- **WCAG 2.2 AA minimum.** Captions view: user-adjustable size up to very large, high-contrast mode, dyslexia-friendly option, reduced motion, screen-reader live regions that don't steal focus.
- Dark-first for the stage and the room (projector glare), with an equally good light mode.
- No custom fonts that need network at runtime. Self-host one font family at most.
- Status colours always paired with text or icons.
- Mobile performance: tiny bundle, no heavy UI kit. Plain CSS variables and a small component set.

## Deliverables (one PR into `apps/web/src/ui/`, by about 13:30)
- `DESIGN.md` at the repo root: principles, the decided direction, and screenshots of the chosen prototypes.
- **Design tokens** as CSS custom properties: colour (light, dark, high-contrast), type scale including caption sizes, spacing, radius, motion, z-layers.
- **Core components:** Button, IconButton, Chip/StatusPill, Card, Sheet/Drawer, Toast, Tabs, Input/TextArea, CaptionStream, QuestionItem, SignalBar, RoomTile (SLO state), Meter, EmptyState, ErrorState, Skeleton.
- Short usage notes so WS3, WS4 and WS6 agents can adopt them without asking.

Coordinate through the orchestrator thread. Don't edit persona folders; persona agents adopt the components.
