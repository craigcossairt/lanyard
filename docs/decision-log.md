# Decision log

## 2026-11-09: Attendee live session layout is "Caption stage" (direction A)

**Decided in:** grill-design round 1, [`docs/design/grill.html`](design/grill.html) (five variants, each with live, loading, empty, error and too-much states, at phone and desktop widths, in all three themes).

**Chosen: A, Caption stage.** Captions own the whole screen. A four-button dock (Ask, Questions, React, Catch up) opens each action in a bottom sheet. At 900 px and wider, questions and signals move into a side panel beside the captions, and the dock keeps only Ask and Catch up. The round 1 visual language (tokens, Atkinson Hyperlegible Next, accent violet, pill and card shapes) is kept as is; see [`DESIGN.md`](../DESIGN.md).

**Why:** it is the only variant that keeps the captions readable at XL and XXL on a phone while still putting every action one tap away. Most people in the room just want to follow along, and for the deaf and hard-of-hearing attendees the Merge Forward entry is about, the captions are the session.

**Rejected:**

- **B, Tabs** (Captions / Questions / Catch up, with a permanent signal strip). The captions disappear when you switch tabs to ask or read questions, which is exactly when you'd still want to follow the talk. The tab bar and signal strip together take about a quarter of the phone's height away from the captions, and they make the hero screen one of three equals. *Kept:* the `Tabs` component, for attendee home and organizer screens.
- **C, One feed** (captions, merged questions and crowd events interleaved like a chat). Reading breaks: chat bubbles and "8 people asked to slow down" events push caption lines apart, and people lose their place. This was the deliberate pushback variant, and it confirmed the constraint: captions need an uninterrupted column.
- **D, Split** (captions fixed in the top 44%, everything else below). At XL or XXL, 44% of a phone holds three or four lines, which fails the requirement to adjust captions up to very large. Too dense on a phone. *Kept:* the "everything visible" idea, for desktop only, as A's side panel.
- **E, Remote control** (huge signal buttons; captions shrink to a 2-line ticker). It deliberately broke the "captions are the centrepiece" rule, and breaking it showed why the rule matters: a 2-line ticker is useless to the people who need captions most. *Kept:* big signal buttons as `SignalBar layout="grid"`.

**The common constraint** (what the four losers broke): *on the live-session screen, nothing may take height, width or reading flow away from the caption column.* This is principle 1 in `DESIGN.md`.

**Not decided in a round:** the speaker console and the organizer board. They reuse the tokens and components (stage-size captions and questions, meters, `RoomTile`); grill them only if they turn out to fight the attendee language.
