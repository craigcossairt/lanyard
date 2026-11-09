# Accessibility

Lanyard is built so people who are usually left out of a conference can follow the room and be heard. Inclusion is the attendee product: captions, anonymous questions, sensory signals and catch-up. This page is the Merge Forward story. Standard we target: **WCAG 2.2 AA**.

Reviewed from the source on `main` after settings landed (`07f2b03`, deployed as `087a926`), plus the language and caption changes in this workstream. Token contrast was measured from `apps/web/src/app/neutral-theme.css`. A full keyboard pass on the live site was not available from this environment; the checklist is that source review.

## Who it is for

| People | What they get | Where |
|---|---|---|
| Deaf and hard-of-hearing attendees | Live captions as the centre of the session, large type, a polite screen-reader announcement of the newest line that does not steal focus | Attendee live session |
| Non-native speakers | The same captions, plus an English / Spanish attendee UI. On-demand caption translation is planned (P1) and not built | Language control; captions stay in the speaker’s language until P1 |
| Shy or neurodivergent attendees | Anonymous questions (no hand-raising, similar questions merge), and sensory signals: slower, louder, can’t see the slides, lost me, and a positive signal | Ask box, question list, signal bar |
| Caregivers, people on a prayer or sensory break, anyone who stepped out | “Catch me up” summarises the last 10 minutes of captions | Catch-up sheet |
| Low-vision attendees | Caption sizes S–XXL, light, dark and high-contrast themes, an easier-to-read font, rem-based type that survives 200% zoom, text on every status | `data-caption-size`, `data-theme`, `data-readable` on `<html>` |
| Motion-sensitive attendees | `prefers-reduced-motion` and an explicit reduce-motion preference zero animation and caption smooth-scroll | `data-motion="reduce"` |
| Speakers and organizers using the keyboard | Named controls, visible focus, landmarks, meters with numbers as well as colour | Speaker console, ops board |

Attendees join from a QR with no account. The only identity is a generated handle. Question text, captions and accessibility preferences are not written to logs, traces or metric labels.

## How to use it

- **Captions.** The speaker starts captions from Chrome or Edge, or types a live note. Attendees see a large scrolling transcript. Scrolling up pauses following and offers “Jump to live”.
- **Ask.** Questions are anonymous. If someone already asked the same thing, the new question joins that cluster.
- **Signals.** Five buttons, each with an icon and a word. Sending one shows “Sent” and `aria-pressed`, not a colour change alone. The speaker sees counts for 60 seconds.
- **Catch up.** One action. The summary is generated from captions, not from a separate account of who left the room.
- **Display and language.** Display & access (`/a/settings`) sets caption size, light / dark / high contrast, an easier-to-read font, and reduced motion. That page, the join page, and the attendee header set the language. English and Spanish switch the attendee interface. Any other language in the list is stored for caption translation, and the interface stays English. The root attributes are applied at startup.

## Standard and what we checked

WCAG 2.2 AA: names, keyboard use, visible focus, contrast, resize to 200%, motion, and information that is not colour alone.

Contrast of the theme tokens (normal text needs 4.5:1, UI boundaries 3:1):

| Pair | Ratio |
|---|---|
| Dark text `#eef0f3` on `#111317` | 16.3:1 |
| Dark muted `#a3aab6` on surface `#1a1d23` | 7.2:1 |
| Dark accent button text `#0b1020` on `#7aa2ff` | 7.6:1 |
| Light text `#14171c` on `#f7f8fa` | 16.9:1 |
| Light muted `#5b6472` on `#f7f8fa` | 5.6:1 |
| Light accent `#2f5bd3` on `#f7f8fa` | 5.6:1 |
| Light focus `#b45309` on `#f7f8fa` | 4.7:1 |
| High contrast white or yellow on black | 16.7:1 and 19.6:1 |

Focus is a 3px solid ring (`--color-focus`) on `:focus-visible`. Status chips always include a word (Live, Answered, Overflow risk, Within capacity). Room health and signal meters use colour as a second channel.

## Checklist

Status is after the WS6 attendee language and caption pass, on top of `main` once settings had landed (`07f2b03`). “Gap” items are still open.

### Join (`/join`)

- [x] `main` and an `h1`
- [x] Event and join-code fields are labelled; the join code says it is optional; the error is `role="alert"`
- [x] Type is in `rem`; the focus ring is visible
- [x] Skip link targets `main`
- [x] Language control; choosing Español sets `html lang="es"` and translates the page

### Attendee home and search (`/a`, `/a/search`)

- [x] Skip link, `header`, `main`, one `h1`
- [x] Search field has a programmatic label; result count is a polite live region
- [x] “Live” is a word plus a dot. Search hits use `<mark>` and an underline, not colour alone
- [x] Save uses `aria-pressed`, and the accessible name includes the talk title
- [x] Display & access is a real settings form (size, theme, readable type, motion, language)

### Attendee live session (`/a/s/:id`)

- [x] Skip link, `h1`, labelled sections, dock `nav`
- [x] Captions expose history to the keyboard and announce only the newest line (`aria-live="polite"`, `aria-atomic="true"`), without moving focus. Each line and that announcement set `lang` to the language of the words on screen (the chunk’s language until a translator changes them)
- [x] Skip links on the shell, join page, and organizer board sit before `main`, so “skip to content” moves past the event picker
- [x] Caption size follows `data-caption-size`. Reduced motion turns off smooth scroll
- [x] Ask sheet is a modal `dialog` (focus trap, Escape, named close button, labelled textarea, `role="alert"` on failure)
- [x] Signals have visible words and `aria-pressed="true"` while on cooldown, and the row wraps instead of staying five fixed columns
- [x] Caption lines are capped at about 66 characters, follow `data-caption-size`, and use the readable font when that preference is on
- [x] A speaker marker shows the people listed on the session, and a new marker when a chunk names a different person. Chunks do not name a person yet, so a session with two speakers shows both names once
- [x] Reconnecting captions keep full contrast and add a warning border plus a text status, instead of fading to 70% opacity
- [x] A polite live region announces how many new questions arrived, without reading the question text and without announcing the backlog on join

### Speaker console (`/s`)

- [x] Skip link, headings, named “Start captions” control, text fallback when the browser has no speech recognition
- [x] Published captions are a polite live region; interim text is hidden from it
- [x] Signal meters expose `aria-valuenow` and a visible count. Answered is a word, not a colour
- [x] The listening pulse stops under reduced motion
- [x] Keyboard-complete for captions, questions and stage mode (buttons and a typed-note field)

### Organizer board (`/o`)

- [x] `main`, `h1`, labelled room and incident regions
- [x] Room state is a text badge plus colour. Occupancy `<progress>` has an accessible name
- [x] Reroute result is a polite status. The simulated crowd control is labelled SIMULATED in text
- [x] Skip link targets `main`
- [x] The summary row wraps (`auto-fit`) instead of four fixed columns

## Known gaps

Honest limits, including things we are not pretending to have done:

- **Caption translation is not built.** It is P1 and may be cut. `translateCaption` returns the original text until a translator is registered with `setCaptionTranslator`. The attendee language is stored at `lanyard.personal.language` (the same key as Display & access) so that translator can plug in without a contract change.
- **No speaker diarization.** The marker names the people listed on the session. It switches mid-stream only when a chunk carries its own `speaker`, and `caption.appended` does not send one today.
- **No automated axe run in CI, and no VoiceOver or TalkBack pass in this audit.** Keyboard behaviour above is from the markup (native `dialog`, labelled controls, skip links, `tabIndex` on the caption history). A manual screen-reader pass is still owed before the demo.
- **Vendor and venue views are not built.** They are P1 and P2.
- **Organizer and speaker UI stay in English.** The language selector translates the attendee interface. Plan-my-day body copy is still English; the page title follows the language.
- **Interactive keyboard and zoom on the deployed URL were not run in this pass.** The checklist is a source review plus measured token contrast. The browser preview was not available from this environment.
