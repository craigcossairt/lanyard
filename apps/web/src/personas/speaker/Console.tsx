import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Session } from '@lanyard/contracts';
import { buildClusterViews } from '../attendee/components/QuestionList';
import { ATTENDEE_SIGNALS } from '../attendee/components/SignalBar';
import { useEventView } from '../attendee/lib/event';
import { cachedSessions } from '../attendee/lib/schedule';
import { useEventId, useSession } from '../attendee/lib/session';
import { useSpeechCaptions } from './lib/captions';
import { useSpeakerConsole } from './lib/console';

const STAGE_KEY = 'lanyard.speaker.stage';
const PREVIEW_LINES = 6;
const LIVE_WINDOW_MS = 15_000;

export default function ConsoleRoute() {
  const { id = '' } = useParams();
  return <Console key={id} id={id} />;
}

function Console({ id }: { id: string }) {
  const eventId = useEventId();
  const me = useSession();
  const { view } = useEventView(eventId);
  const session = useMemo<Session | null>(() => {
    const fromView = [...(view?.now ?? []), ...(view?.next ?? [])].find((s) => s.id === id);
    return fromView ?? cachedSessions(eventId)[id] ?? null;
  }, [view, eventId, id]);
  const live = useSpeakerConsole(id);
  const captions = useSpeechCaptions(id);
  const [stage, setStage] = useState(() => {
    try {
      return localStorage.getItem(STAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const toggleAnswered = (clusterId: string, answered: boolean) => {
    setAnswerError(null);
    void live.setAnswered(clusterId, answered).catch((err: unknown) => {
      setAnswerError(err instanceof Error ? err.message : 'Could not update that question.');
    });
  };

  useEffect(() => {
    try {
      localStorage.setItem(STAGE_KEY, stage ? '1' : '0');
    } catch {
      // Per-visit only.
    }
  }, [stage]);

  // The session ending hides the caption controls, so stop the mic ourselves.
  const stopCaptions = captions.stop;
  useEffect(() => {
    if (live.ended) stopCaptions();
  }, [live.ended, stopCaptions]);

  const clusters = useMemo(
    () => buildClusterViews(live.questions, live.clusters),
    [live.questions, live.clusters],
  );
  const openClusters = clusters.filter((c) => !c.answered);
  const answeredClusters = clusters.filter((c) => c.answered);
  const attendance = live.attendance?.count ?? 0;
  const canSpeak = me?.role === 'speaker' || me?.role === 'organizer';

  const sendNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = notes.trim();
    if (!t) return;
    setNotesError(null);
    try {
      await captions.postTyped(t);
      setNotes((cur) => (cur.trim() === t ? '' : cur));
    } catch {
      setNotesError('Could not send that line. Check the connection and try again.');
    }
  };

  const listening = captions.state === 'listening' || captions.state === 'starting';
  // What attendees see comes from the stream (snapshot tail + caption.appended), whatever the
  // source: this mic, typed notes, or a scripted speaker. Our own POSTs echo back on the stream,
  // so the local list is only a fallback until the echo arrives.
  const lines =
    live.captions.length > 0
      ? live.captions.map((c) => ({ id: c.chunkId, text: c.text }))
      : captions.recent.map((text, i) => ({ id: `local-${i}`, text }));
  // Only the tail is rendered (full history stays in state); keep it scrolled to the latest.
  const visible = lines.slice(-PREVIEW_LINES);
  const previewRef = useRef<HTMLDivElement>(null);
  const latestId = visible[visible.length - 1]?.id;
  useEffect(() => {
    const el = previewRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [latestId, captions.interim]);
  // "Live" means a caption arrived in the last 15 s from any source, not just that history exists.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);
  const captionsLive = live.lastCaptionAt !== null && now - live.lastCaptionAt < LIVE_WINDOW_MS;

  return (
    <div className={`sp-page${stage ? ' sp-page--stage' : ''}`}>
      <header className="sp-header">
        <a href="#main" className="at-skip">
          Skip to content
        </a>
        <Link to="/s" className="sp-back" aria-label="Back to session list">
          <span aria-hidden="true">‹</span> Sessions
        </Link>
        <div className="sp-header__title">
          <h1>{session?.title ?? 'Speaker console'}</h1>
          <p className="sp-muted">
            {live.ended ? (
              <span className="sp-pill">Ended</span>
            ) : (
              <span className="sp-pill sp-pill--live">● Live</span>
            )}
            {captionsLive && !listening && (
              <span className="sp-pill sp-pill--live"> ● Captions live</span>
            )}
            {live.stream === 'reconnecting' && <span> · Reconnecting…</span>}
          </p>
        </div>
        <div className="sp-header__stats" aria-live="polite">
          <span className="sp-stat">
            <strong>{attendance}</strong> <span className="sp-stat__label">in the room</span>
          </span>
          <span className="sp-stat">
            <strong>{openClusters.length}</strong>{' '}
            <span className="sp-stat__label">open questions</span>
          </span>
        </div>
        <button
          type="button"
          className="sp-btn"
          aria-pressed={stage}
          onClick={() => setStage((s) => !s)}
        >
          {stage ? 'Exit stage mode' : 'Stage mode'}
        </button>
      </header>

      <main id="main" className="sp-main sp-grid">
        <section className="sp-panel sp-panel--captions" aria-labelledby="cap-h">
          <div className="sp-panel__head">
            <h2 id="cap-h">Captions</h2>
            {captions.supported && !live.ended && (
              <button
                type="button"
                className={`sp-btn sp-btn--lg ${listening ? '' : 'sp-btn--primary'}`}
                aria-pressed={listening}
                onClick={listening ? captions.stop : captions.start}
                disabled={!canSpeak}
              >
                <span aria-hidden="true">{listening ? '⏹' : '🎙'}</span>{' '}
                {listening ? 'Stop captions' : 'Start captions'}
              </button>
            )}
          </div>
          {!canSpeak && (
            <p className="sp-banner" role="status">
              A speaker link is needed to publish captions. Ask the organizer for one, then open it
              in this browser.
            </p>
          )}
          {!captions.supported && (
            <p className="sp-banner" role="status">
              This browser has no speech recognition. Use Chrome or Edge for mic captions, or type
              live notes below: they reach attendees as captions too.
            </p>
          )}
          {captions.error && (
            <p className="sp-banner sp-banner--warn" role="alert">
              {captions.error}
            </p>
          )}
          <p className="sp-status" role="status">
            {captions.state === 'listening' && (
              <>
                <span className="sp-dot" aria-hidden="true" /> Listening. {captions.sentCount}{' '}
                captions sent.
              </>
            )}
            {captions.state === 'starting' && 'Starting the microphone…'}
            {captions.state === 'idle' &&
              captions.supported &&
              (captionsLive
                ? 'Captions are coming from another source. Start the mic to add yours.'
                : 'Captions are off. Attendees see them the moment you start.')}
            {captions.state === 'blocked' && 'Microphone blocked.'}
          </p>
          {/* Screen readers hear each published caption once; interim text stays silent. */}
          <div className="at-sr-only" aria-live="polite" aria-atomic="true">
            {lines[lines.length - 1]?.text ?? ''}
          </div>
          <div
            ref={previewRef}
            className="sp-captions"
            aria-label="What attendees see"
            style={{ maxHeight: '40vh', overflowY: 'auto' }}
          >
            {visible.map((line) => (
              <p key={line.id} className="sp-captions__final">
                {line.text}
              </p>
            ))}
            {captions.interim && (
              <p className="sp-captions__interim" aria-hidden="true">
                {captions.interim}
              </p>
            )}
            {lines.length === 0 && !captions.interim && (
              <p className="sp-muted">Your words appear here as you speak.</p>
            )}
          </div>
          <form className="sp-notes" onSubmit={(e) => void sendNotes(e)}>
            <label htmlFor="notes" className="sp-notes__label">
              Typed live note (sent as a caption)
            </label>
            <div className="sp-notes__row">
              <input
                id="notes"
                className="sp-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                disabled={!canSpeak}
                placeholder="e.g. Slides are at lanyard.dev/slides"
              />
              <button type="submit" className="sp-btn" disabled={!canSpeak || !notes.trim()}>
                Send
              </button>
            </div>
            {notesError && (
              <p role="alert" className="sp-error">
                {notesError}
              </p>
            )}
          </form>
        </section>

        <section className="sp-panel sp-panel--questions" aria-labelledby="q-h">
          <h2 id="q-h">
            Questions{' '}
            <span className="sp-muted sp-h2-sub">ranked by votes, then how many asked</span>
          </h2>
          <div aria-live="polite" className="at-sr-only">
            {openClusters.length} open questions
          </div>
          {answerError && (
            <p role="alert" className="sp-banner sp-banner--warn">
              {answerError}
            </p>
          )}
          {openClusters.length === 0 ? (
            <p className="sp-muted">
              No open questions. Attendees ask from their phones; similar ones merge here.
            </p>
          ) : (
            <ol className="sp-clusters">
              {openClusters.map((c, i) => (
                <li key={c.cluster.id} className="sp-cluster">
                  <span className="sp-cluster__rank" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="sp-cluster__body">
                    <p className="sp-cluster__text">
                      {c.representative?.text || c.cluster.label || 'Question'}
                    </p>
                    <p className="sp-cluster__meta">
                      <span>
                        ▲ {c.votes} {c.votes === 1 ? 'vote' : 'votes'}
                      </span>
                      {c.size > 1 && <span>· {c.size} people asked this</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="sp-btn"
                    aria-pressed={false}
                    disabled={!canSpeak}
                    onClick={() => toggleAnswered(c.cluster.id, true)}
                  >
                    Answered
                  </button>
                </li>
              ))}
            </ol>
          )}
          {answeredClusters.length > 0 && (
            <details className="sp-answered">
              <summary>{answeredClusters.length} answered</summary>
              <ul className="sp-clusters sp-clusters--done">
                {answeredClusters.map((c) => (
                  <li key={c.cluster.id} className="sp-cluster">
                    <div className="sp-cluster__body">
                      <p className="sp-cluster__text">
                        {c.representative?.text || c.cluster.label}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="sp-btn sp-btn--sm"
                      aria-pressed
                      disabled={!canSpeak}
                      onClick={() => toggleAnswered(c.cluster.id, false)}
                    >
                      ✓ Answered
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="sp-panel sp-panel--signals" aria-labelledby="sig-h">
          <h2 id="sig-h">
            Room signals <span className="sp-muted sp-h2-sub">last 60 seconds</span>
          </h2>
          <ul className="sp-meters">
            {ATTENDEE_SIGNALS.map((s) => {
              const n = live.signals[s.type] ?? 0;
              const denom = Math.max(attendance, 1);
              const ratio = Math.min(1, n / denom);
              const tone =
                s.type === 'thumbs_up'
                  ? 'ok'
                  : ratio >= 0.15
                    ? 'crit'
                    : ratio >= 0.05
                      ? 'warn'
                      : 'neutral';
              return (
                <li key={s.type} className={`sp-meter sp-meter--${tone}`}>
                  <div className="sp-meter__head">
                    <span>
                      <span aria-hidden="true">{s.icon}</span> {s.label}
                    </span>
                    <strong>
                      {n} <span className="sp-meter__unit">{n === 1 ? 'person' : 'people'}</span>
                    </strong>
                  </div>
                  <div
                    className="sp-meter__bar"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={denom}
                    aria-valuenow={n}
                    aria-label={`${s.label}: ${n} of ${attendance} people`}
                  >
                    <div
                      className="sp-meter__fill"
                      style={{ width: `${Math.round(ratio * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
