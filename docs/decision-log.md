# Decision log

## 2026-11-09: Speaker console is a private presenter view that owns the deck (round 2, direction E)

**Decided in:** grill-design rounds 1 and 2, [`docs/design/grill-speaker.html`](design/grill-speaker.html) (round 1 is in git history at `0fd4c41`). Each round had five variants, with live, Q&A, not started, loading, no speech API and too-much states, at laptop, confidence-monitor and phone widths, in all three themes.

**Round 1 settled who the screen is for.** It serves the speaker only. The audience already has its own view (the attendee live session, with captions and Ask), and the room sees slides. Speakers usually present from Keynote or PowerPoint with a presenter display for their notes, so notes must take most of the screen, with room cues visible and questions within reach. Questions are sometimes asked through a moderator or host.

- *Dead:* **Room screen** and **Question wall**. Both were projected, audience-facing screens, which duplicates the attendee view and puts the room's anonymous questions on the projector.
- *Dead as a live view:* **Timeline** (signals plotted against what was said). It's analysis, not something to read mid-sentence; it belongs in the P1 post-talk digest.
- *Carried forward:* **Cockpit** (speaker-only), and two ideas from **Two modes**: show a cue only when the room needs something, and give Q&A its own mode with one question at a time.

**Round 2 asked where the notes live. Chosen: E, Presenter replacement.** Lanyard owns the deck. The speaker uploads a PDF and presents from Lanyard. The console shows the current slide, the next slide, notes for this slide in large type, and a rail with room cues and the questions asked during this slide. Q&A mode turns the rail into a one-at-a-time queue (Answered, next / Skip). A separate **stage window** goes on the projector and shows the slide.

**Why:** it's the only variant where slides, notes, cues and questions stay in sync without effort. The clicker drives Lanyard, so nothing drifts. Questions and signals can be tied to the slide they came from ("asked during this slide"), which also makes the post-talk digest better.

**Rejected in round 2:**

- **A, Notes + rail** (paste notes; Lanyard as presenter view without slides). Slides still run in Keynote and the clicker drives Keynote, so Lanyard's notes drift from the slides unless the speaker steps them by hand.
- **B, Script follows your voice** (captions find your place in a pasted script). This depends on speech recognition being available and accurate (Chrome only), and it falls back to manual scrolling exactly when things go wrong. Speakers rarely work from a full script.
- **C, Companion strip** (a slim Lanyard window beside Keynote's presenter display). It splits the speaker's attention across two apps and can't connect questions or signals to slides.
- **D, Host handoff** (a moderator curates questions and sends one at a time to the speaker). It needs a second person, who often isn't there. *Kept as a later layer:* host messages ("5 min left") and host-sent questions can feed the same Q&A rail in E.

These round 2 reasons are the designer's reading of the user's choice; amend them if yours differ.

**Constraints for building E (WS3):**

- **PDF rendering:** load pdf.js only on the speaker route (`/s`), lazily, so the attendee bundle stays tiny.
- **Notes:** PDF exports don't reliably carry speaker notes. Provide notes per slide in a simple editor (or pasted text split by slide), stored with the session. The notes view must work with no deck uploaded (notes only), so a missing PDF never blocks the talk.
- **Projector:** "Open stage window" opens a second window (for example `/s/:sessionId/stage`) that the speaker drags to the projector and makes full screen. Sync slide changes over `BroadcastChannel`. The stage window can show the join QR in a corner, which is how the room joins: this replaces `06-demo.md`'s plan to project the speaker console.
- **Clicker:** clickers send arrow or Page Up/Down keys to the focused window. Keep the console focused, handle those keys, and broadcast the slide change.
- **Slide-linked questions and captions:** need the current slide index on the session (a small contracts addition, coordinated with WS2). If that lands late, show the overall queue instead of "asked during this slide".

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

**Not decided in this round:** the speaker console (decided later, in its own two rounds: see the entry above) and the organizer board (round in progress).
