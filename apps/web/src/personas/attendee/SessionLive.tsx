import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { CatchUpResponse, Recommendation, Session } from '@lanyard/contracts';
import { CaptionStream } from './components/CaptionStream';
import { QuestionList } from './components/QuestionList';
import { Sheet } from './components/Sheet';
import { SignalBar } from './components/SignalBar';
import { useToast } from './components/Toast';
import { api, ApiError } from './lib/api';
import { useEventView } from './lib/event';
import { useLiveSession } from './lib/live';
import { cachedSessions } from './lib/schedule';
import { useEventId, useSession } from './lib/session';

type SheetName = 'ask' | 'questions' | 'catchup' | 'reroute' | null;
const CATCH_UP_MINUTES = 10;

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

  // A reroute suggestion arrives on the stream; surface it as a sheet (it is a decision, not a toast).
  useEffect(() => {
    if (live.reroute) setSheet('reroute');
  }, [live.reroute]);

  const open = live.questions.filter((q) => q.status !== 'hidden').length;
  const connected = live.stream === 'open' || live.stream === 'connecting';
  const captionStatus = connected ? (live.captions.length ? 'live' : 'waiting') : 'stale';

  return (
    <div className="at-page at-live">
      <header className="at-live__head">
        <a href="#main" className="at-skip">
          Skip to content
        </a>
        <Link to="/a" className="at-back" aria-label="Back to home">
          <span aria-hidden="true">‹</span> Home
        </Link>
        <div className="at-live__title">
          <h1>{live.session?.title ?? 'Live session'}</h1>
          <p className="at-live__sub">
            {live.ended ? (
              <span className="at-pill">Ended</span>
            ) : (
              <span className="at-pill at-pill--live">
                <span aria-hidden="true">●</span> Live
              </span>
            )}
            {live.attendance && (
              <span>
                {' '}
                · {live.attendance.count} here
                <span className="at-sr-only"> of {live.attendance.capacity} seats</span>
              </span>
            )}
            {live.stream === 'reconnecting' && <span> · Reconnecting…</span>}
            {me?.handle && <span className="at-live__handle"> · You are {me.handle}</span>}
          </p>
        </div>
        <Link
          to="/a/settings"
          className="at-btn at-btn--sm"
          aria-label="Display settings: text size, contrast"
        >
          Aa
        </Link>
      </header>

      <main id="main" className="at-live__main">
        <CaptionStream lines={live.captions} status={captionStatus} />

        <section aria-labelledby="signals-h" className="at-live__signals">
          <h2 id="signals-h" className="at-sr-only">
            Tell the speaker
          </h2>
          <SignalBar
            onSignal={live.signal}
            onSent={(label) =>
              toast(`Sent “${label}” anonymously. The speaker sees it for 60 seconds.`)
            }
          />
        </section>
      </main>

      <nav className="at-dock" aria-label="Session actions">
        <button
          type="button"
          className="at-dock__btn at-dock__btn--primary"
          onClick={() => setSheet('ask')}
        >
          <span aria-hidden="true">✍️</span> Ask
        </button>
        <button type="button" className="at-dock__btn" onClick={() => setSheet('questions')}>
          <span aria-hidden="true">💬</span> Questions
          {open > 0 && (
            <span className="at-dock__badge">
              {open}
              <span className="at-sr-only"> questions</span>
            </span>
          )}
        </button>
        <button type="button" className="at-dock__btn" onClick={() => setSheet('catchup')}>
          <span aria-hidden="true">⏪</span> Catch up
        </button>
      </nav>

      <AskSheet
        open={sheet === 'ask'}
        onClose={() => setSheet(null)}
        ask={live.ask}
        onAsked={() => setSheet('questions')}
      />

      <Sheet
        open={sheet === 'questions'}
        onClose={() => setSheet(null)}
        title="Questions"
        description="Similar questions are merged. Upvote the ones you want answered."
      >
        <QuestionList
          questions={live.questions}
          clusters={live.clusters}
          voted={live.voted}
          mine={live.mine}
          onVote={(qid) => void live.vote(qid).catch(() => toast('Could not vote right now.'))}
        />
        <button
          type="button"
          className="at-btn at-btn--primary at-block"
          onClick={() => setSheet('ask')}
        >
          Ask a question
        </button>
      </Sheet>

      <CatchUpSheet open={sheet === 'catchup'} onClose={() => setSheet(null)} sessionId={id} />

      <RerouteSheet
        open={sheet === 'reroute' && Boolean(live.reroute)}
        recommendation={live.reroute}
        eventId={eventId}
        onClose={() => {
          setSheet(null);
          live.dismissReroute();
        }}
        onGo={(sessionId) => {
          live.dismissReroute();
          setSheet(null);
          navigate(`/a/s/${encodeURIComponent(sessionId)}`);
        }}
      />
    </div>
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
      toast(
        res.merged && others > 0
          ? `Asked. Merged with ${others} ${others === 1 ? 'other asking' : 'others asking'} this, so the speaker sees one question.`
          : 'Asked anonymously. The speaker sees it now.',
      );
      onAsked();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your question. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ask a question"
      description="Anonymous. If someone already asked it, yours joins theirs."
    >
      <form onSubmit={(e) => void submit(e)}>
        <label htmlFor="ask-text" className="at-sr-only">
          Your question
        </label>
        <textarea
          id="ask-text"
          className="at-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="What would you like to ask?"
          data-autofocus
          required
        />
        {error && (
          <p role="alert" className="at-field-error">
            {error}
          </p>
        )}
        <div className="at-sheet__actions">
          <button type="submit" className="at-btn at-btn--primary" disabled={busy || !text.trim()}>
            {busy ? 'Sending…' : 'Ask'}
          </button>
          <span className="at-muted">{text.length}/500</span>
        </div>
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
            error: e instanceof ApiError ? e.message : 'Could not summarise right now.',
          }),
      );
    return () => {
      alive = false;
    };
  }, [open, sessionId]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Catch me up`}
      description={`The last ${CATCH_UP_MINUTES} minutes, summarised from the captions.`}
    >
      {state.status === 'loading' && (
        <p className="at-muted" role="status">
          Summarising…
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="at-field-error">
          {state.error}
        </p>
      )}
      {state.status === 'done' && (
        <p className="at-catchup">{state.summary || 'Nothing has been said yet.'}</p>
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
      toast('Could not confirm the move, taking you there anyway.');
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
      <div className="at-sheet__actions">
        <button
          type="button"
          className="at-btn at-btn--primary"
          disabled={busy}
          onClick={() => void accept()}
        >
          {busy ? 'Moving…' : 'Take me there'}
        </button>
        <button type="button" className="at-btn" onClick={onClose}>
          Stay here
        </button>
      </div>
    </Sheet>
  );
}
