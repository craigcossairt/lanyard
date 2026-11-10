# Accessibility

Lanyard is built so people who are usually left out of a conference can follow the room and be heard. Inclusion is the attendee product: captions, anonymous questions, sensory signals and catch-up. This page is the Merge Forward story. Standard we target: **WCAG 2.2 AA**.

This describes `main` at `e9f863d` (demo freeze). Token contrast was measured from `apps/web/src/ui/tokens.css`. A keyboard pass on the live site and a screen-reader pass were not run from this environment; the checklist is that source review.

## Who it is for

| People | What they get | Where |
|---|---|---|
| Deaf and hard-of-hearing attendees | Live captions as the centre of the session, large type, a polite screen-reader announcement of the newest line that does not steal focus | Attendee live session |
| Non-native speakers | The same captions. The interface on `main` is English. An English / Spanish switcher is built in [#52](https://github.com/craigcossairt/lanyard/pull/52) and merges after the hackathon | Captions now; language switcher after the event |
| Shy or neurodivergent attendees | Anonymous questions (no hand-raising, similar questions merge), and sensory signals: slower, louder, can’t see the slides, lost me, and a positive signal | Ask box, question list, signal bar |
| Caregivers, people on a prayer or sensory break, anyone who stepped out | “Catch me up” summarises the last 10 minutes of captions | Catch-up sheet |
| Low-vision attendees | Caption sizes S–XXL, light, dark and high-contrast themes, Atkinson Hyperlegible, wider tracking when “readable” is on, rem-based type, text on every status | `data-caption-size`, `data-theme`, `data-readable` on `<html>` |
| Motion-sensitive attendees | `prefers-reduced-motion` and an explicit reduce-motion preference zero durations and caption smooth-scroll | `data-motion="reduce"` |
| People who want to meet others without a public profile | Networking starts private. Opting in shows only a handle and a LinkedIn link to other opted-in attendees, and turning it off deletes the profile | Meet people |
| Speakers and organizers using the keyboard | Named controls, visible focus, landmarks, meters with numbers as well as colour | Speaker console, ops board |

Attendees join from a QR with no account. The only identity is a generated handle. Question text, captions and accessibility preferences are not written to logs, traces or metric labels.

## How to use it

- **Captions.** The speaker starts captions from Chrome or Edge, or types a live note. Attendees see a large scrolling transcript. Scrolling up pauses following and offers “Jump to live”. The newest line is a polite live region.
- **Ask.** Questions are anonymous. If someone already asked the same thing, the new question joins that cluster.
- **Signals.** Buttons with an icon and a word. Sending one shows “Sent” and `aria-pressed`, not a colour change alone. The speaker sees counts for 60 seconds.
- **Catch up.** One action. The summary is generated from captions, not from a separate account of who left the room.
- **Display.** Display & access sets caption size, light / dark / high contrast, readable spacing, and reduced motion. The app starts in the dark theme; high contrast is one tap away in Display & access and is remembered on the device. The language list on that page is stored for caption translation; it does not switch the interface yet.
- **Skip link.** The app bar’s “Skip to content” moves focus to `#main` (or the first `<main>`). Full-screen live and speaker views hide the bar and carry their own skip link.
- **Meet people.** The profile starts private. The consent copy says who can see the handle and LinkedIn link, that Lanyard does not fetch the LinkedIn page, and that opting out deletes the profile. The control is a toggle with `aria-pressed`.

## Standard and what we checked

WCAG 2.2 AA: names, keyboard use, visible focus, contrast, resize to 200%, motion, and information that is not colour alone.

Contrast of the design-system tokens (normal text needs 4.5:1, UI boundaries 3:1), measured from `tokens.css`:

| Pair | Ratio |
|---|---|
| Dark text `#eef1f6` on `#0b0d12` | 17.2:1 |
| Dark muted `#a9b1c2` on surface `#141821` | 8.3:1 |
| Dark accent button text `#150a33` on `#b69cff` | 8.2:1 |
| Dark captions `#fffdf6` on `#05060a` | 19.9:1 |
| Dark interim caption `#9aa3b5` on `#05060a` | 8.0:1 |
| Light text `#10131c` on `#f5f6f8` | 17.2:1 |
| Light muted `#4a5266` on `#f5f6f8` | 7.2:1 |
| Light accent `#5b34d6` on `#f5f6f8` | 6.7:1 |
| Light focus `#0b57d0` on `#f5f6f8` | 5.9:1 |
| High contrast white, yellow or cyan on black | 21:1, 16.1:1 and 13.7:1 |
| Strong control border on its surface (dark / light) | 4.0:1 and 3.8:1 |

Focus is a 3px solid ring (`--color-focus`) on `:focus-visible`. Status chips always include a word. Room health and signal meters use colour as a second channel. Reconnecting captions switch to the interim caption colour and a dashed edge, not a faded opacity. Answered questions keep full contrast and add the word “Answered”.

## Checklist

Status is what is on `main` at the freeze. “Gap” items are still open.

### Shell and join

- [x] App bar skip link targets `main` and is the first control in the bar
- [x] Join fields are labelled; errors use `role="alert"`
- [x] Type is in `rem`; the focus ring is visible
- [ ] The join page does not yet switch the interface language (built in #52, after the hackathon)

### Attendee home, search, settings

- [x] `header`, `main`, one `h1`; the shell skip link covers these routes
- [x] Display & access is a real settings form (size, theme, readable type, motion)
- [x] Interests are optional and leave the device only after an explicit opt-in
- [ ] Search and home strings are English only until #52

### Attendee live session

- [x] Its own skip link, because the app bar hides on this route; labelled caption section; dock `nav`
- [x] Caption history is in the tab order and announces only the newest line (`aria-live="polite"`, `aria-atomic="true"`), without moving focus
- [x] Caption size follows `data-caption-size`. Reduced motion turns off smooth scroll
- [x] Ask sheet is a modal `dialog` (focus trap, Escape, named close button)
- [x] Signals have visible words and `aria-pressed` while on cooldown
- [x] Reconnecting captions keep contrast and add a text status
- [ ] Per-line `lang` is on the design-system caption reader ([#73](https://github.com/craigcossairt/lanyard/pull/73)). The live session still uses its own caption list and does not set `lang` yet

### Meet people

- [x] Consent copy before the toggle: private until opt-in, handle and LinkedIn link only, visible only to other opted-in attendees, delete on opt-out
- [x] The toggle exposes `aria-pressed`. Empty and error states are text, not colour
- [x] Match suggestions are a polite live region

### Speaker console and organizer board

- [x] Skip link, headings, named “Start captions” control, text fallback when the browser has no speech recognition
- [x] Published captions are a polite live region; interim text is hidden from it
- [x] Signal meters expose a visible count. Answered is a word, not a colour
- [x] Room state is a text badge plus colour

## Known gaps

- **The English / Spanish interface is built and not on `main`.** [#52](https://github.com/craigcossairt/lanyard/pull/52) has the catalog, the language control, caption `lang`, and the attendee string pass. It conflicts with the shell that landed for the demo, so it merges after the hackathon. Until then the UI is English, and the settings language is only a stored preference for caption translation.
- **Caption translation is not built.** Captions stay in the speaker’s language. #52 leaves `setCaptionTranslator` ready for a later translator.
- **Live captions do not set `lang` yet.** The design-system reader will, when a caller passes `CaptionLine.lang`. The session view on `main` does not.
- **No speaker diarization.** A session with two speakers does not mark the change of voice.
- **No automated axe run, and no VoiceOver or TalkBack pass.** Keyboard behaviour above is from the markup. A manual screen-reader pass is still owed.
- **Vendor and venue views are not built.**
- **This pass did not click through the deployed site.** Contrast figures are computed from the token hex values.
