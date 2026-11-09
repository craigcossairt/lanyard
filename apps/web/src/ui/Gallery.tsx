// Reference compositions built from the real components, with fixture data.
// Mount <UiGallery /> on a dev-only route (e.g. /dev/ui) to see every component in every theme.
// <AttendeeLiveExample /> is the decided attendee live-session layout (direction A): copy its shape.
import { useEffect, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  CaptionStage,
  CaptionStream,
  DisplaySettings,
  EmptyState,
  ErrorState,
  IconButton,
  Meter,
  QuestionItem,
  QuestionList,
  RoomTile,
  Sheet,
  SignalBar,
  SkeletonList,
  StatusPill,
  Tabs,
  TextArea,
  TextInput,
  useDisplayPrefs,
  useToast,
  type AttendeeSignal,
  type CaptionLine,
} from './index';

const LINES: CaptionLine[] = [
  {
    id: 1,
    speaker: 'Priya Raman',
    text: 'So the first thing to understand is that eBPF lets you run sandboxed programs inside the kernel without changing kernel source.',
  },
  {
    id: 2,
    text: 'For security folks, that means you can observe every exec, every file open, every network connection, at very low overhead.',
  },
  {
    id: 3,
    text: "The classic mistake is treating it like a firewall. It isn't. It's a sensor first.",
  },
  {
    id: 4,
    text: "Let's look at a real trace from a compromised pod. You'll see the shell spawn here, and then an outbound connection to an IP nobody recognises.",
  },
  {
    id: 5,
    text: 'Tetragon and Falco both sit on top of this. Tetragon can also enforce, by killing the process in-kernel before the syscall returns.',
  },
  {
    id: 6,
    text: 'Now, the overhead question. We measured under two percent CPU on a busy node with about forty policies loaded.',
  },
];

const CLUSTERS = [
  {
    id: 'c1',
    label: 'Overhead on large clusters?',
    text: 'How does the overhead scale past 500 nodes, and does it differ between Tetragon and Falco?',
    askers: 14,
    votes: 31,
    mine: true,
  },
  {
    id: 'c2',
    label: 'Kernel version requirements',
    text: 'Which kernel versions do we need for BTF / CO-RE to work without shipping headers?',
    askers: 6,
    votes: 12,
  },
  {
    id: 'c3',
    label: 'Running alongside a service mesh',
    text: 'Does this conflict with Cilium or Istio sidecars already hooking the same points?',
    askers: 3,
    votes: 7,
  },
];

const CATCH_UP = [
  'Priya introduced eBPF as a sensor first, not a firewall.',
  'Walked a real trace: shell spawn in a compromised pod, then an unknown outbound connection.',
  'Tetragon can enforce in-kernel; Falco alerts. Both build on the same hooks.',
  'Measured overhead: under 2% CPU with about 40 policies.',
];

export type SheetName = 'ask' | 'questions' | 'react' | 'catchup' | 'display' | null;

function useSignals() {
  const toast = useToast();
  const [sent, setSent] = useState<Partial<Record<AttendeeSignal, boolean>>>({});
  return {
    sent,
    onSignal(type: AttendeeSignal) {
      setSent((s) => ({ ...s, [type]: true }));
      toast('Sent anonymously. Priya sees it for 60 s.');
      setTimeout(() => setSent((s) => ({ ...s, [type]: false })), 2500);
    },
  };
}

function Questions({
  voted,
  onVote,
}: {
  voted: Record<string, boolean>;
  onVote: (id: string) => void;
}) {
  return (
    <QuestionList>
      {CLUSTERS.map((c) => (
        <QuestionItem
          key={c.id}
          label={c.label}
          text={c.text}
          askers={c.askers}
          votes={c.votes + (voted[c.id] && !c.mine ? 1 : 0)}
          mine={c.mine}
          voted={!!voted[c.id] || c.mine}
          onVote={() => onVote(c.id)}
        />
      ))}
    </QuestionList>
  );
}

/** Direction A: the attendee live session. */
export function AttendeeLiveExample({
  state = 'live',
  initialSheet = null,
}: {
  state?: 'live' | 'loading' | 'waiting' | 'stale';
  initialSheet?: SheetName;
}) {
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetName>(initialSheet);
  const [voted, setVoted] = useState<Record<string, boolean>>({});
  const [lines, setLines] = useState(LINES.slice(0, 4));
  const signals = useSignals();

  useEffect(() => {
    if (state !== 'live') return;
    const t = setInterval(
      () => setLines((l) => (l.length < LINES.length ? LINES.slice(0, l.length + 1) : l)),
      2500,
    );
    return () => clearInterval(t);
  }, [state]);

  const vote = (id: string) => setVoted((v) => ({ ...v, [id]: !v[id] }));
  const close = () => setSheet(null);

  return (
    <>
      <CaptionStage
        title="eBPF for Security Folks: Tracing Without Tears"
        count={142}
        onDisplaySettings={() => setSheet('display')}
        banner={
          state === 'stale' && (
            <Banner
              icon="offline"
              action={{
                label: 'Retry now',
                onClick: () => toast('Reconnected. Captions resumed.'),
              }}
            >
              Reconnecting… captions paused at 10:42
            </Banner>
          )
        }
        captions={
          <CaptionStream
            lines={lines}
            interim={state === 'live' ? 'and the rule here is that' : undefined}
            status={state}
            waiting={{
              title: 'Captions start when Priya does',
              body: 'The session begins at 10:30. Keep this open; text appears here automatically.',
            }}
          />
        }
        side={
          <>
            <h2>Questions</h2>
            <Questions voted={voted} onVote={vote} />
            <h2>Tell the speaker</h2>
            <SignalBar {...signals} />
          </>
        }
        dock={
          <>
            <Button variant="primary" stacked icon="ask" onClick={() => setSheet('ask')}>
              Ask
            </Button>
            <Button
              stacked
              icon="list"
              badge={CLUSTERS.length}
              data-dock-desktop="hide"
              onClick={() => setSheet('questions')}
            >
              Questions<span className="ly-sr-only">, {CLUSTERS.length}</span>
            </Button>
            <Button
              stacked
              icon="thumbs_up"
              data-dock-desktop="hide"
              onClick={() => setSheet('react')}
            >
              React
            </Button>
            <Button stacked icon="catchup" onClick={() => setSheet('catchup')}>
              Catch up
            </Button>
          </>
        }
      />

      <Sheet
        open={sheet === 'ask'}
        onClose={close}
        title="Ask anonymously"
        description="No name attached. If someone already asked something similar, you'll join them."
      >
        <form
          style={{ display: 'grid', gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            close();
            toast('Merged: you and 13 others asked this. Priya sees it as one question.', {
              ms: 4000,
            });
          }}
        >
          <TextArea
            label="Your question"
            hideLabel
            placeholder="Type your question…"
            required
            data-autofocus
          />
          <Button variant="primary" type="submit">
            Send question
          </Button>
        </form>
      </Sheet>
      <Sheet open={sheet === 'questions'} onClose={close} title="Questions">
        <Questions voted={voted} onVote={vote} />
      </Sheet>
      <Sheet
        open={sheet === 'react'}
        onClose={close}
        title="Tell the speaker"
        description="Anonymous. Counts show on the speaker's screen for 60 seconds."
      >
        <SignalBar {...signals} />
      </Sheet>
      <Sheet open={sheet === 'catchup'} onClose={close} title="Catch me up · last 10 min">
        <ul
          style={{
            margin: 0,
            paddingLeft: '1.1em',
            display: 'grid',
            gap: 10,
            fontSize: 'var(--text-lg)',
          }}
        >
          {CATCH_UP.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="ly-muted" style={{ fontSize: 'var(--text-sm)' }}>
          AI summary of the live captions. May miss details.
        </p>
      </Sheet>
      <Sheet open={sheet === 'display'} onClose={close} title="Display">
        <DisplaySettings />
      </Sheet>
    </>
  );
}

/** Speaker console sample: stage-size captions, ranked clusters, signal meters. */
export function SpeakerConsoleExample() {
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', height: '100dvh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 16 }}>
          <StatusPill tone="crit" icon="mic">
            Captions on
          </StatusPill>
          <span className="ly-muted ly-num" style={{ fontSize: 'var(--text-xl)' }}>
            142 here
          </span>
        </div>
        <CaptionStream lines={LINES.slice(-3)} interim="and the rule here is that" size="stage" />
      </div>
      <div
        style={{
          padding: 24,
          display: 'grid',
          gap: 24,
          alignContent: 'start',
          overflow: 'auto',
          borderLeft: 'var(--border-w) solid var(--color-border)',
        }}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <Meter
            size="lg"
            label="Slower"
            value={8}
            max={142}
            valueText="8 people"
            warnAt={0.05}
            critAt={0.15}
          />
          <Meter
            size="lg"
            label="Lost me"
            value={23}
            max={142}
            valueText="23 people"
            warnAt={0.05}
            critAt={0.15}
          />
          <Meter size="lg" label="Got it" value={41} max={142} valueText="41 people" />
        </div>
        <QuestionList label="Question clusters, ranked">
          {CLUSTERS.map((c, i) => (
            <QuestionItem
              key={c.id}
              size="stage"
              rank={i + 1}
              label={c.label}
              askers={c.askers}
              votes={c.votes}
              answered={answered[c.id]}
              actions={
                <Button
                  aria-pressed={!!answered[c.id]}
                  onClick={() => setAnswered((a) => ({ ...a, [c.id]: !a[c.id] }))}
                >
                  Answered
                </Button>
              }
            />
          ))}
        </QuestionList>
      </div>
    </div>
  );
}

/** Organizer sample: rooms as services. */
export function OpsRoomsExample() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 12,
      }}
    >
      <RoomTile
        name="Room 255 B"
        state="ok"
        occupancy={142}
        capacity={240}
        session="eBPF for Security Folks"
        stats={{ signals: 8, questions: 23 }}
        onSelect={() => {}}
      />
      <RoomTile
        name="Hall F"
        state="warn"
        occupancy={402}
        capacity={500}
        session="Platform Engineering Day keynote"
        stats={{ signals: 31, questions: 54 }}
        onSelect={() => {}}
      />
      <RoomTile
        name="Room 12"
        state="crit"
        stateLabel="Overflow"
        occupancy={118}
        capacity={120}
        session="Gateway API deep dive"
        stats={{ signals: 12, questions: 9 }}
        onSelect={() => {}}
      />
    </div>
  );
}

/** Every component, every state. Theme follows the Display settings. */
export function UiGallery() {
  const { prefs, setPrefs } = useDisplayPrefs();
  const [tab, setTab] = useState('a');
  const [sheet, setSheet] = useState(false);
  const toast = useToast();
  const signals = useSignals();
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24, display: 'grid', gap: 32 }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, flex: 1 }}>Lanyard UI</h1>
        {(['dark', 'light', 'contrast'] as const).map((t) => (
          <Button key={t} aria-pressed={prefs.theme === t} onClick={() => setPrefs({ theme: t })}>
            {t}
          </Button>
        ))}
      </header>
      <section style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <h2 className="ly-sr-only">Buttons and pills</h2>
        <Button variant="primary" icon="ask">
          Primary
        </Button>
        <Button>Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button disabled>Disabled</Button>
        <IconButton icon="display" label="Display settings" />
        <Button onClick={() => toast('Sent anonymously.')}>Show toast</Button>
        <Button onClick={() => setSheet(true)}>Open sheet</Button>
        <StatusPill tone="ok">Healthy</StatusPill>
        <StatusPill tone="warn">At risk</StatusPill>
        <StatusPill tone="crit">Breached</StatusPill>
        <StatusPill tone="info">You + 13 others</StatusPill>
        <StatusPill>Neutral</StatusPill>
      </section>
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 16,
        }}
      >
        <Card>
          <h2>Fields</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <TextInput
              label="Search sessions"
              placeholder="eBPF, platform, security…"
              hint="Searches titles, abstracts and speakers."
            />
            <TextInput label="Room" defaultValue="Room 99" error="No room with that name." />
            <TextArea label="Ask anonymously" rows={2} />
          </div>
        </Card>
        <Card>
          <h2>Tabs</h2>
          <Tabs
            label="Example"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'a', label: 'Now', panel: <p>Sessions on now.</p> },
              { id: 'b', label: 'Next', panel: <p>Starting in the next hour.</p> },
              {
                id: 'c',
                label: 'Mine',
                panel: (
                  <EmptyState title="Nothing saved yet">
                    Tap the star on a session to add it.
                  </EmptyState>
                ),
              },
            ]}
          />
        </Card>
        <Card>
          <h2>Meters</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <Meter
              label="Occupancy"
              value={142}
              max={240}
              valueText="142 / 240"
              warnAt={0.75}
              critAt={0.9}
            />
            <Meter
              label="Occupancy"
              value={190}
              max={240}
              valueText="190 / 240"
              warnAt={0.75}
              critAt={0.9}
            />
            <Meter
              label="Occupancy"
              value={232}
              max={240}
              valueText="232 / 240"
              warnAt={0.75}
              critAt={0.9}
            />
            <Meter label="Caption lag" value={0.4} max={2} valueText="0.4 s" />
          </div>
        </Card>
        <Card>
          <h2>Signals</h2>
          <SignalBar {...signals} />
        </Card>
        <Card>
          <h2>States</h2>
          <SkeletonList count={2} height={40} />
          <ErrorState onRetry={() => {}}>
            We'll retry automatically. Your question is saved.
          </ErrorState>
        </Card>
      </section>
      <OpsRoomsExample />
      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Sheet"
        description="Bottom sheet on phones, drawer on laptops."
      >
        <DisplaySettings />
      </Sheet>
    </main>
  );
}
