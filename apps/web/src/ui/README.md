# Lanyard UI: usage notes

For WS3 (attendee and speaker), WS4 (organizer) and WS6 (accessibility). Design rationale: [`/DESIGN.md`](../../../../DESIGN.md).

## Setup (WS0 shell, once)

In `apps/web/src/main.tsx`, replace the neutral theme import and wrap the app:

```tsx
import './ui/styles.css'; // replaces './app/neutral-theme.css'
import { DisplayPrefsProvider, ToastProvider } from './ui';

<DisplayPrefsProvider>
  <ToastProvider>
    <App />
  </ToastProvider>
</DisplayPrefsProvider>
```

Note: the commented import in the WS0 shell reads `'../ui/styles.css'`; from `src/main.tsx` the right path is `'./ui/styles.css'`.

Optionally mount `UiGallery` (from `./ui/Gallery`) on a dev-only route such as `/dev/ui`, to check every component in every theme.

## Rules

- Import from `src/ui` (`import { Button, Sheet } from '../../ui'`). Don't copy the markup.
- Colours, sizes and durations come only from `var(--…)` tokens in `tokens.css`. No hex values in persona code.
- Don't restyle `ly-` classes. If a component is missing something, add a prop here and tell the orchestrator.
- One `variant="primary"` button per screen.
- Status is never colour alone: use `StatusPill` (text plus icon) or `Meter` (text value).

## Attendee live session (WS3)

Copy the shape of `AttendeeLiveExample` in `Gallery.tsx`: `CaptionStage` + `CaptionStream` + a 4-button dock + `Sheet`s.

```tsx
<CaptionStage
  title={session.title}
  count={attendance}
  onDisplaySettings={() => setSheet('display')}
  banner={disconnected && <Banner icon="offline" action={{ label: 'Retry now', onClick: reconnect }}>Reconnecting… captions paused at {time}</Banner>}
  captions={<CaptionStream lines={chunks.map(c => ({ id: c.seq, text: c.text }))} interim={interim} status={disconnected ? 'stale' : 'live'} />}
  side={<><h2>Questions</h2><QuestionList>…</QuestionList><h2>Tell the speaker</h2><SignalBar onSignal={send} sent={sent} /></>}
  dock={<>
    <Button variant="primary" stacked icon="ask" onClick={…}>Ask</Button>
    <Button stacked icon="list" badge={n} data-dock-desktop="hide" onClick={…}>Questions<span className="ly-sr-only">, {n}</span></Button>
    <Button stacked icon="thumbs_up" data-dock-desktop="hide" onClick={…}>React</Button>
    <Button stacked icon="catchup" onClick={…}>Catch up</Button>
  </>}
/>
```

- `CaptionStream` `status`: `loading` shows skeleton lines, `waiting` shows the "starts when the speaker does" empty state, and `stale` dims the lines (pair it with a `Banner`). Pass `speaker` on a line only when the speaker changes.
- After a question is sent: `toast('Merged: you and 13 others asked this. Priya sees it as one question.')`. After a signal: `toast('Sent anonymously. Priya sees it for 60 s.')` and set `sent[type]` for about 2.5 s.
- `QuestionItem`: `askers` = cluster size, `mine` shows "You + N others", `onVote` + `voted` for the upvote toggle.
- Ask sheet: put `data-autofocus` on the `TextArea`.

## Speaker console (WS3)

- Stage mode: `<CaptionStream size="stage" />` and `<QuestionItem size="stage" rank={i + 1} actions={<Button aria-pressed={answered}>Answered</Button>} />` (omit `onVote` to show the rank).
- Signals: `<Meter size="lg" label="Lost me" value={n} max={attendance} valueText={`${n} people`} warnAt={0.05} critAt={0.15} />`.
- Start captions: `<Button variant="primary" size="lg" icon="mic">Start captions</Button>`. For an unsupported browser, use `<Banner tone="info">`, plus a `TextArea` for typed live notes.
- See `SpeakerConsoleExample` in `Gallery.tsx`.

## Organizer ops board (WS4)

- Rooms: `<RoomTile name state="ok|warn|crit" stateLabel="Overflow" occupancy capacity session stats={{ signals, questions }} onSelect />`. The default labels are Healthy, At risk and Breached; the occupancy meter turns amber at 75% and red at 90%.
- Alert feed: a `Card` per alert with a `StatusPill tone={severity}` and `<Button variant="primary" icon="route">Reroute</Button>`.
- Use `Tabs` for views (Rooms / Alerts / Ask). Put "SIMULATED" in a `<StatusPill tone="warn">` on every simulated view.

## Components

| Component | Use for |
| --- | --- |
| `Button` | `variant` secondary, primary, ghost or danger; `size="lg"`; `icon`; `stacked` (dock); `badge`; `block`. Use `aria-pressed` for toggles; pressed buttons render as accent. |
| `IconButton` | Icon only; `label` is required (it becomes the accessible name). |
| `StatusPill`, `LivePill` | Tones ok, warn, crit, info and neutral, each with a default icon. |
| `Card` | Surface container; `selected` adds the accent edge. |
| `Sheet` | Bottom sheet on phones, right drawer at 900 px and wider. `open`, `onClose`, `title`, `description`. |
| `ToastProvider`, `useToast` | `toast(text, { icon, ms })`. Polite, never takes focus, no actions. |
| `Tabs` | `items=[{ id, label, panel }]`, `value`, `onChange`, `label`. |
| `TextInput`, `TextArea` | `label` (required; `hideLabel` keeps it for screen readers), `hint`, `error`. |
| `CaptionStream` | Live captions with auto-follow, Jump to live, and a live region. |
| `QuestionItem`, `QuestionList` | Merged question clusters. |
| `SignalBar` | The five attendee signals; `layout="grid"` for big buttons. `SIGNALS` lists the labels and icons. |
| `Meter` | Labelled bar with a text value; `warnAt` and `critAt` thresholds. |
| `RoomTile` | Organizer room "service". |
| `EmptyState`, `ErrorState`, `Banner`, `Skeleton`, `SkeletonList` | Empty, failed, connection-level and loading states. |
| `CaptionStage` | The direction A live-session layout. |
| `DisplayPrefsProvider`, `useDisplayPrefs`, `DisplaySettings` | Theme, caption size, readable spacing and reduce motion, saved to localStorage and applied to `<html>`. `DisplaySettings` is the body of the "Display" sheet; sync `prefs` to the server's `AccessibilityPrefs` if you want it to follow the person. |
| `Icon` | Inline stroke icons; `IconName` lists them. Decorative only. |

## WS6 checklist per screen

Check each screen with the keyboard alone, with VoiceOver (iOS) or TalkBack, at 200% zoom, at XXL caption size, in all three themes, with reduce motion on, and confirm no status is shown by colour alone. Token contrast is already checked (AA everywhere; AAA for body text). Component-level guarantees are listed in `DESIGN.md` under "Accessibility built into the components".
