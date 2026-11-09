import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { CatchUpResponse, Recommendation, Session } from '@lanyard/contracts';
import { readLocaleSnapshot, translate } from '../../i18n/locale';
import { LanguageSelect, useI18n } from '../../i18n/useI18n';
import { CaptionStream } from './components/CaptionStream';
import { useCaptionTranslation } from './live/captionTranslation';
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
const CATCH_UP_MINUTES = 10;

/** Keyed by session id so a reroute to another room remounts with fresh state. */
export default function SessionLiveRoute() {
  const { id = '' } = useParams();
  return <SessionLive key={id} id={id} />;
}

function SessionLive({ id }: { id: string }) {
  const { t } = useI18n();
  const eventId = useEventId();
  const me = useSession();
  const { view } = useEventView(eventId);
  const known = useMemo<Session | null>(() => {
    const fromView = [...(view?.now ?? []), ...(view?.next ?? [])].find((s) => s.id === id);
    return fromView ?? cachedSessions(eventId)[id] ?? null;
  }, [view, eventId, id]);
  const live = useLiveSession(id, known);
  useCaptionTranslation(id, live.captions);
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
  const [questionAnnounce, setQuestionAnnounce] = useState('');
  const seenOpen = useRef<number | null>(null);
  useEffect(() => {
    if (!live.ready) return;
    if (seenOpen.current === null) {
      seenOpen.current = open;
      return;
    }
    const delta = open - seenOpen.current;
    seenOpen.current = open;
    if (delta <= 0) return;
    const msg = t(delta === 1 ? 'newQuestionsOne' : 'newQuestions', { count: delta, open });
    // Clear first so a repeat of the same sentence still notifies the live region.
    setQuestionAnnounce('');
    const frame = requestAnimationFrame(() => setQuestionAnnounce(msg));
    return () => cancelAnimationFrame(frame);
  }, [open, live.ready, t]);

  return (
    <div className="at-page at-live">
      <header className="at-live__head">
        <a href="#main" className="at-skip">
          {t('skip')}
        </a>
        <Link to="/a" className="at-back" aria-label={t('backHome')}>
          <span aria-hidden="true">‹</span> {t('home')}
        </Link>
        <div className="at-live__title">
          <h1>{live.session?.title ?? t('liveSession')}</h1>
          <p className="at-live__sub">
            {live.ended ? (
              <span className="at-pill">{t('ended')}</span>
            ) : (
              <span className="at-pill at-pill--live">
                <span aria-hidden="true">●</span> {t('live')}
              </span>
            )}
            {live.attendance && (
              <span>
                {' '}
                · {t('here', { count: live.attendance.count })}
                <span className="at-sr-only">
                  {' '}
                  {t('seats', { capacity: live.attendance.capacity })}
                </span>
              </span>
            )}
            {live.stream === 'reconnecting' && <span> · {t('reconnecting')}</span>}
            {me?.handle && (
              <span className="at-live__handle">
                {' '}
                · {t('youAre')} {me.handle}
              </span>
            )}
          </p>
        </div>
        <LanguageSelect id="live-lang" compact />
        <Link to="/a/settings" className="at-btn at-btn--sm" aria-label={t('displaySettings')}>
          Aa
        </Link>
      </header>

      <main id="main" tabIndex={-1} className="at-live__main">
        <CaptionStream
          lines={live.captions}
          status={captionStatus}
          speakers={live.session?.speakerNames ?? []}
        />

        <section aria-labelledby="signals-h" className="at-live__signals">
          <h2 id="signals-h" className="at-sr-only">
            {t('tellSpeaker')}
          </h2>
          <SignalBar
            onSignal={live.signal}
            onSent={(label) => toast(t('signalToast', { label }))}
            onFailed={(label) => toast(`Could not send “${label}”. Try again in a moment.`)}
          />
        </section>
      </main>

      <nav className="at-dock" aria-label={t('sessionActions')}>
        <button
          type="button"
          className="at-dock__btn at-dock__btn--primary"
          onClick={() => setSheet('ask')}
        >
          <span aria-hidden="true">✍️</span> {t('ask')}
        </button>
        <button type="button" className="at-dock__btn" onClick={() => setSheet('questions')}>
          <span aria-hidden="true">💬</span> {t('questions')}
          {open > 0 && (
            <span className="at-dock__badge">
              {open}
              <span className="at-sr-only"> {t('questions')}</span>
            </span>
          )}
        </button>
        <button type="button" className="at-dock__btn" onClick={() => setSheet('catchup')}>
          <span aria-hidden="true">⏪</span> {t('catchUp')}
        </button>
      </nav>
      <div className="at-sr-only" aria-live="polite">
        {questionAnnounce}
      </div>

      <AskSheet
        open={sheet === 'ask'}
        onClose={() => setSheet(null)}
        ask={live.ask}
        onAsked={() => setSheet('questions')}
      />

      <Sheet
        open={sheet === 'questions'}
        onClose={() => setSheet(null)}
        title={t('questionsTitle')}
        description={t('questionsDescription')}
      >
        <QuestionList
          questions={live.questions}
          clusters={live.clusters}
          voted={live.voted}
          mine={live.mine}
          onVote={(qid) => void live.vote(qid).catch(() => toast(t('voteFail')))}
        />
        <button
          type="button"
          className="at-btn at-btn--primary at-block"
          onClick={() => setSheet('ask')}
        >
          {t('askAQuestion')}
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
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ask(question);
      setText('');
      const others = Math.max(0, res.cluster.size - 1);
      toast(
        res.merged && others > 1
          ? t('askedMerged', { count: others })
          : res.merged && others === 1
            ? t('askedMergedOne')
            : t('asked'),
      );
      onAsked();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : friendly(err, 'Asking', translate(readLocaleSnapshot().ui, 'askFail')),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('askTitle')} description={t('askDescription')}>
      <form onSubmit={(e) => void submit(e)}>
        <label htmlFor="ask-text" className="at-sr-only">
          {t('yourQuestion')}
        </label>
        <textarea
          id="ask-text"
          className="at-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder={t('askPlaceholder')}
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
            {busy ? t('sending') : t('ask')}
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
  const { t } = useI18n();
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
            error:
              e instanceof ApiError
                ? e.message
                : friendly(e, 'Catch-up', translate(readLocaleSnapshot().ui, 'catchUpFail')),
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
      title={t('catchUpTitle')}
      description={t('catchUpDescription', { minutes: CATCH_UP_MINUTES })}
    >
      {state.status === 'loading' && (
        <p className="at-muted" role="status">
          {t('summarising')}
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="at-field-error">
          {state.error}
        </p>
      )}
      {state.status === 'done' && <p className="at-catchup">{state.summary || t('nothingSaid')}</p>}
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
  const { t } = useI18n();
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
      toast(t('rerouteFail'));
      onGo(recommendation.sessionId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('roomFull')} description={recommendation.reason}>
      <div className="at-sheet__actions">
        <button
          type="button"
          className="at-btn at-btn--primary"
          disabled={busy}
          onClick={() => void accept()}
        >
          {busy ? t('moving') : t('takeMe')}
        </button>
        <button type="button" className="at-btn" onClick={onClose}>
          {t('stay')}
        </button>
      </div>
    </Sheet>
  );
}
