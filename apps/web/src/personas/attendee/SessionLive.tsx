import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { CatchUpResponse, Recommendation, Session, SignalType } from '@lanyard/contracts';
import {
  Banner,
  Button,
  CaptionStage,
  CaptionStream,
  QuestionItem,
  QuestionList,
  Sheet,
  SignalBar,
  TextArea,
  useToast,
  type AttendeeSignal,
} from '../../ui';
import { DisplayPrefsPanel } from './components/DisplayPrefsPanel';
import { buildClusterViews } from './components/QuestionList';
import { api, ApiError } from './lib/api';
import { useEventView } from './lib/event';
import { useLiveSession } from './lib/live';
import { cachedSessions } from './lib/schedule';
import { useEventId, useSession } from './lib/session';

type SheetName = 'ask' | 'questions' | 'react' | 'catchup' | 'display' | 'reroute' | null;
const CATCH_UP_MINUTES = 10;
/** Matches the API's rate limit: one signal per type per 30 s per person. */
const SIGNAL_COOLDOWN_MS = 30_000;

/** People never see a raw "No route for POST /api/..." message. */
function friendly(err: unknown, feature: string, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return `${feature} isn't available for this session yet.`;
    if (err.status === 401 || err.status === 403)
      return `Please rejoin the event to use ${feature.toLowerCase()}.`;
    if (err.status === 429) return 'Easy there. Try again in a moment.';
    return err.message || fallback;
  }
  return fallback;
}

/** Keyed by session id so a reroute to another room remounts with fresh state. */
export default function SessionLiveRoute() {
  const { id = '' } = useParams();
  return <SessionLive key={id} id={id} />;
}

function SessionLive({ id }: { id: string }) {
  const eventId = useEventId();
  const me = useSession();
  const { view } = useEventView(eventId);
  const known = useMemo<Session | null>(() => {
    const fromView = [...(view?.now ?? []), ...(view?.next ?? [])].find((s) => s.id === id);
    return fromView ?? cachedSessions(eventId)[id] ?? null;
  }, [view, eventId, id]);
  const live = useLiveSession(id, known);
  const toast = useToast();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<SheetName>(null);
  // The <dialog> close event is queued after dialog.close(), so a sheet switch can deliver
  // the old sheet's close after the new one opened. Each sheet only closes itself.
  const closeIf = (name: SheetName) => () => setSheet((s) => (s === name ? null : s));

  // A reroute suggestion arrives on the stream; surface it as a sheet (it is a decision, not a toast).
  useEffect(() => {
    if (live.reroute) setSheet('reroute');
  }, [live.reroute]);

  // Signals: pressed "Sent" state per type for the cooldown window.
  const [sent, setSent] = useState<Partial<Record<AttendeeSignal, boolean>>>({});
  const timers = useRef<Partial<Record<AttendeeSignal, ReturnType<typeof setTimeout>>>>({});
  useEffect(() => () => Object.values(timers.current).forEach((t) => t && clearTimeout(t)), []);
  const sendSignal = (type: AttendeeSignal) => {
    if (sent[type]) return;
    setSent((s) => ({ ...s, [type]: true }));
    live
      .signal(type as SignalType)
      .then(() => {
        toast('Sent anonymously. The speaker sees it for 60 seconds.');
        timers.current[type] = setTimeout(
          () => setSent((s) => ({ ...s, [type]: false })),
          SIGNAL_COOLDOWN_MS,
        );
      })
      .catch((err: unknown) => {
        setSent((s) => ({ ...s, [type]: false }));
        toast(friendly(err, 'Signals', 'Could not send that. Try again in a moment.'), {
          icon: 'warn',
        });
      });
  };

  const clusters = useMemo(
    () => buildClusterViews(live.questions, live.clusters),
    [live.questions, live.clusters],
  );
  const connected = live.stream === 'open' || live.stream === 'connecting';
  const captionStatus = !connected ? 'stale' : live.captions.length ? 'live' : 'waiting';
  const title = live.session?.title ?? 'Live session';

  const questions = (
    <QuestionList>
      {clusters.length === 0 && (
        <li className="ly-muted">No questions yet. Yours could be first.</li>
      )}
      {clusters.map((c) => {
        const qid = c.representative?.id ?? c.cluster.representativeQuestionId;
        const text = c.representative?.text || c.cluster.label || 'Question';
        return (
          <QuestionItem
            key={c.cluster.id}
            label={text}
            votes={c.votes}
            askers={c.size}
            mine={live.mine(c.cluster.id)}
            answered={c.answered}
            voted={live.voted(qid)}
            onVote={() =>
              void live
                .vote(qid)
                .catch((err: unknown) =>
                  toast(friendly(err, 'Voting', 'Could not vote right now.'), { icon: 'warn' }),
                )
            }
          />
        );
      })}
    </QuestionList>
  );

  return (
    <>
      <CaptionStage
        title={title}
        live={!live.ended}
        count={live.attendance?.count}
        onDisplaySettings={() => setSheet('display')}
        banner={
          <>
            {/* CaptionStage has no back slot yet; a compact nav keeps a way home from a direct link. */}
            <nav className="at-stage-nav" aria-label="Session">
              <Link to="/a">‹ Home</Link>
              {me?.handle && (
                <span className="ly-muted">
                  <span className="ly-sr-only">You are </span>
                  {me.handle}
                </span>
              )}
            </nav>
            {live.stream === 'reconnecting' && (
              <Banner icon="offline">Reconnecting… captions catch up automatically.</Banner>
            )}
          </>
        }
        captions={
          <CaptionStream
            lines={live.captions.map((c) => ({ id: c.chunkId, text: c.text }))}
            status={captionStatus}
            waiting={{
              title: 'Captions start when the speaker does',
              body: 'Keep this open. Text appears here automatically, and you can ask a question any time.',
            }}
          />
        }
        side={
          <>
            <h2>Questions</h2>
            {questions}
            <h2>Tell the speaker</h2>
            <SignalBar onSignal={sendSignal} sent={sent} />
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
              badge={clusters.length || undefined}
              data-dock-desktop="hide"
              onClick={() => setSheet('questions')}
            >
              Questions
              <span className="ly-sr-only">, {clusters.length}</span>
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

      <AskSheet
        open={sheet === 'ask'}
        onClose={closeIf('ask')}
        ask={live.ask}
        onAsked={() => setSheet('questions')}
      />

      <Sheet
        open={sheet === 'questions'}
        onClose={closeIf('questions')}
        title="Questions"
        description="Similar questions are merged. Upvote the ones you want answered."
      >
        {questions}
        <Button variant="primary" block icon="ask" onClick={() => setSheet('ask')}>
          Ask a question
        </Button>
      </Sheet>

      <Sheet
        open={sheet === 'react'}
        onClose={closeIf('react')}
        title="Tell the speaker"
        description="Anonymous. Counts show on the speaker's screen for 60 seconds."
      >
        <SignalBar onSignal={sendSignal} sent={sent} layout="grid" />
      </Sheet>

      <CatchUpSheet open={sheet === 'catchup'} onClose={closeIf('catchup')} sessionId={id} />

      <Sheet open={sheet === 'display'} onClose={closeIf('display')} title="Display">
        <DisplayPrefsPanel />
      </Sheet>

      <RerouteSheet
        open={sheet === 'reroute' && Boolean(live.reroute)}
        recommendation={live.reroute}
        eventId={eventId}
        onClose={() => {
          setSheet((s) => (s === 'reroute' ? null : s));
          live.dismissReroute();
        }}
        onGo={(sessionId) => {
          live.dismissReroute();
          setSheet(null);
          navigate(`/a/s/${encodeURIComponent(sessionId)}`);
        }}
      />
    </>
  );
}

function AskSheet({
  open,
  onClose,
  ask,
  onAsked,
}: {
  open: boolean;
  onClose: () => void;
  ask: (t: string) => Promise<{ merged: boolean; cluster: { size: number } }>;
  onAsked: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ask(t);
      setText('');
      const others = Math.max(0, res.cluster.size - 1);
      onAsked();
      toast(
        res.merged && others > 0
          ? `Merged: you and ${others} ${others === 1 ? 'other' : 'others'} asked this. The speaker sees one question.`
          : 'Asked anonymously. The speaker sees it now.',
        { ms: 4000 },
      );
    } catch (err) {
      setError(friendly(err, 'Asking', 'Could not send your question. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ask anonymously"
      description="No name attached. If someone already asked something similar, you'll join them."
    >
      <form onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <TextArea
          label="Your question"
          hideLabel
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Type your question…"
          hint={`${text.length}/500`}
          error={error ?? undefined}
          required
          data-autofocus
        />
        <Button variant="primary" type="submit" disabled={busy || !text.trim()}>
          {busy ? 'Sending…' : 'Send question'}
        </Button>
      </form>
    </Sheet>
  );
}

function CatchUpSheet({
  open,
  onClose,
  sessionId,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
}) {
  const [state, setState] = useState<{
    status: 'idle' | 'loading' | 'done' | 'error';
    summary?: string;
    error?: string;
  }>({ status: 'idle' });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setState({ status: 'loading' });
    api
      .post<CatchUpResponse>(`/sessions/${encodeURIComponent(sessionId)}/catch-up`, {
        minutes: CATCH_UP_MINUTES,
      })
      .then((r) => alive && setState({ status: 'done', summary: r.summary }))
      .catch(
        (e: unknown) =>
          alive &&
          setState({
            status: 'error',
            error: friendly(e, 'Catch-up', 'Could not summarise right now.'),
          }),
      );
    return () => {
      alive = false;
    };
  }, [open, sessionId]);

  return (
    <Sheet open={open} onClose={onClose} title={`Catch me up · last ${CATCH_UP_MINUTES} min`}>
      {state.status === 'loading' && (
        <p className="ly-muted" role="status">
          Summarising the captions…
        </p>
      )}
      {state.status === 'error' && <Banner tone="warn">{state.error}</Banner>}
      {state.status === 'done' && (
        <>
          <p style={{ fontSize: 'var(--text-lg)', lineHeight: 1.5, margin: 0 }}>
            {state.summary || 'Nothing has been said yet.'}
          </p>
          <p className="ly-muted" style={{ fontSize: 'var(--text-sm)' }}>
            AI summary of the live captions. May miss details.
          </p>
        </>
      )}
    </Sheet>
  );
}

function RerouteSheet({
  open,
  recommendation,
  eventId,
  onClose,
  onGo,
}: {
  open: boolean;
  recommendation: Recommendation | null;
  eventId: string;
  onClose: () => void;
  onGo: (sessionId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!recommendation) return null;
  const suggestionId = (recommendation as Recommendation & { suggestionId?: string }).suggestionId;

  const accept = async () => {
    setBusy(true);
    try {
      let target = recommendation.sessionId;
      if (suggestionId) {
        const res = await api.post<{ accepted: boolean; sessionId: string }>(
          `/events/${encodeURIComponent(eventId)}/reroute/accept`,
          { suggestionId },
        );
        target = res.sessionId || target;
      }
      onGo(target);
    } catch {
      toast('Could not confirm the move, taking you there anyway.', { icon: 'warn' });
      onGo(recommendation.sessionId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="This room is full"
      description={recommendation.reason}
    >
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <Button variant="primary" icon="route" disabled={busy} onClick={() => void accept()}>
          {busy ? 'Moving…' : 'Take me there'}
        </Button>
        <Button onClick={onClose}>Stay here</Button>
      </div>
    </Sheet>
  );
}
