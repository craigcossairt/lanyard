import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Session } from '@lanyard/contracts';
import {
  Banner,
  Button,
  CaptionStream,
  LivePill,
  Meter,
  QuestionItem,
  QuestionList,
  SIGNALS,
  StatusPill,
  TextInput,
} from '../../ui';
import { buildClusterViews } from '../attendee/components/QuestionList';
import { useEventView } from '../attendee/lib/event';
import { cachedSessions } from '../attendee/lib/schedule';
import { useEventId, useSession } from '../attendee/lib/session';
import { useDelayedFlag } from '../attendee/lib/useDelayedFlag';
import { useSpeechCaptions } from './lib/captions';
import { useSpeakerConsole } from './lib/console';

const STAGE_KEY = 'lanyard.speaker.stage';

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
  // source: this mic, typed notes, or a scripted speaker on the server. Our own POSTs echo back
  // on the stream, so the local `recent` list is only a fallback until the echo arrives.
  const streamLines = live.captions.map((c) => ({ id: c.chunkId, text: c.text }));
  const lines = streamLines.length > 0 ? streamLines : captions.recent;
  const captionsLive = lines.length > 0 || listening;
  const captionStatus = lines.length === 0 && !captions.interim ? 'waiting' : 'live';
  const offline = useDelayedFlag(live.stream === 'reconnecting', 3_000);

  return (
    <div className={`sp-page${stage ? ' sp-page--stage' : ''}`}>
      <header className="sp-header">
        <a href="#main" className="ly-sr-only sp-skip">
          Skip to content
        </a>
        <Link to="/s" className="sp-back" aria-label="Back to session list">
          ‹ Sessions
        </Link>
        <div className="sp-header__title">
          <h1>{session?.title ?? 'Speaker console'}</h1>
          <p className="sp-header__pills">
            {live.ended ? <StatusPill tone="neutral">Ended</StatusPill> : <LivePill />}
            {listening ? (
              <StatusPill tone="crit" icon="mic">
                Captions on
              </StatusPill>
            ) : (
              lines.length > 0 && <StatusPill tone="ok">Captions live</StatusPill>
            )}
            {offline && (
              <StatusPill tone="warn" icon="offline">
                Reconnecting
              </StatusPill>
            )}
          </p>
        </div>
        <div className="sp-header__stats" aria-live="polite">
          <span className="sp-stat">
            <strong className="ly-num">{attendance}</strong>{' '}
            <span className="sp-stat__label">in the room</span>
          </span>
          <span className="sp-stat">
            <strong className="ly-num">{openClusters.length}</strong>{' '}
            <span className="sp-stat__label">open questions</span>
          </span>
        </div>
        <Button variant="ghost" aria-pressed={stage} onClick={() => setStage((s) => !s)}>
          {stage ? 'Exit stage mode' : 'Stage mode'}
        </Button>
      </header>

      <main id="main" className="sp-main sp-grid">
        <section className="sp-panel sp-panel--captions" aria-labelledby="cap-h">
          <div className="sp-panel__head">
            <h2 id="cap-h">Captions</h2>
            {captions.supported && !live.ended && (
              <Button
                variant={listening ? 'secondary' : 'primary'}
                size="lg"
                icon="mic"
                aria-pressed={listening}
                onClick={listening ? captions.stop : captions.start}
                disabled={!canSpeak}
              >
                {listening ? 'Stop captions' : 'Start captions'}
              </Button>
            )}
          </div>
          {!canSpeak && (
            <Banner tone="info">
              A speaker link is needed to publish captions. Ask the organizer for one, then open it
              in this browser.
            </Banner>
          )}
          {!captions.supported && (
            <Banner tone="info">
              This browser has no speech recognition. Use Chrome or Edge for mic captions, or type
              live notes below: they reach attendees as captions too.
            </Banner>
          )}
          {captions.error && (
            <Banner tone="warn" icon="warn">
              {captions.error}
            </Banner>
          )}
          <p className="sp-status ly-muted" role="status">
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
          {/* CaptionStream's role="log" announces each published caption once; interim text stays silent. */}
          <CaptionStream
            lines={lines}
            interim={captions.interim || undefined}
            status={captionStatus}
            size={stage ? 'stage' : 'wide'}
            label="What attendees see"
            waiting={{
              title: 'Your words appear here as you speak',
              body: 'Attendees see the same text on their phones, as large as they like.',
            }}
          />
          <form className="sp-notes" onSubmit={(e) => void sendNotes(e)}>
            <div className="sp-notes__row">
              <TextInput
                label="Typed live note (sent as a caption)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                disabled={!canSpeak}
                placeholder="e.g. Slides are at lanyard.dev/slides"
                error={notesError ?? undefined}
              />
              <Button type="submit" disabled={!canSpeak || !notes.trim()}>
                Send
              </Button>
            </div>
          </form>
        </section>

        <section className="sp-panel sp-panel--questions" aria-labelledby="q-h">
          <h2 id="q-h">
            Questions{' '}
            <span className="ly-muted sp-h2-sub">ranked by votes, then how many asked</span>
          </h2>
          <div aria-live="polite" className="ly-sr-only">
            {openClusters.length} open questions
          </div>
          {answerError && (
            <Banner tone="warn" icon="warn">
              {answerError}
            </Banner>
          )}
          {openClusters.length === 0 ? (
            <p className="ly-muted">
              No open questions. Attendees ask from their phones; similar ones merge here.
            </p>
          ) : (
            <QuestionList label="Question clusters, ranked">
              {openClusters.map((c, i) => (
                <QuestionItem
                  key={c.cluster.id}
                  size={stage ? 'stage' : 'default'}
                  rank={i + 1}
                  label={c.representative?.text || c.cluster.label || 'Question'}
                  votes={c.votes}
                  askers={c.size}
                  actions={
                    <Button
                      aria-pressed={false}
                      disabled={!canSpeak}
                      onClick={() => toggleAnswered(c.cluster.id, true)}
                    >
                      Answered
                    </Button>
                  }
                />
              ))}
            </QuestionList>
          )}
          {answeredClusters.length > 0 && (
            <details className="sp-answered">
              <summary>{answeredClusters.length} answered</summary>
              <QuestionList label="Answered questions">
                {answeredClusters.map((c) => (
                  <QuestionItem
                    key={c.cluster.id}
                    label={c.representative?.text || c.cluster.label || 'Question'}
                    votes={c.votes}
                    askers={c.size}
                    answered
                    actions={
                      <Button
                        aria-pressed
                        disabled={!canSpeak}
                        onClick={() => toggleAnswered(c.cluster.id, false)}
                      >
                        Answered
                      </Button>
                    }
                  />
                ))}
              </QuestionList>
            </details>
          )}
        </section>

        <section className="sp-panel sp-panel--signals" aria-labelledby="sig-h">
          <h2 id="sig-h">
            Room signals <span className="ly-muted sp-h2-sub">last 60 seconds</span>
          </h2>
          <div className="sp-meters">
            {SIGNALS.map((s) => {
              const n = live.signals[s.type] ?? 0;
              const denom = Math.max(attendance, 1);
              const thresholds = s.type === 'thumbs_up' ? {} : { warnAt: 0.05, critAt: 0.15 };
              return (
                <Meter
                  key={s.type}
                  size={stage ? 'lg' : 'default'}
                  label={s.label}
                  value={n}
                  max={denom}
                  valueText={`${n} ${n === 1 ? 'person' : 'people'}`}
                  {...thresholds}
                />
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
