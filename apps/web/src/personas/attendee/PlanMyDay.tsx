import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { PlanMyDayResponse, Session } from '@lanyard/contracts';
import { AttendeeHeader } from './components/AttendeeHeader';
import { SessionCard } from './components/SessionCard';
import { api, ApiError } from './lib/api';
import { roomById, useEventView } from './lib/event';
import { usePrefs } from './lib/prefs';
import { cachedSessions, useMySchedule } from './lib/schedule';
import { useEventId, useSession } from './lib/session';

/** WS1 may denormalise the cited sessions onto the response; we use them when present. */
type PlanResponse = PlanMyDayResponse & { sessions?: Session[] };

export default function PlanMyDay() {
  const eventId = useEventId();
  const me = useSession();
  const { view } = useEventView(eventId);
  const { prefs, setPrefs } = usePrefs();
  const schedule = useMySchedule(eventId);
  const [interests, setInterests] = useState(prefs.interests);
  const [state, setState] = useState<{
    status: 'idle' | 'loading' | 'done' | 'error';
    plan?: PlanResponse;
    error?: string;
  }>({ status: 'idle' });

  const known = useMemo(() => {
    const map: Record<string, Session> = { ...cachedSessions(eventId) };
    for (const s of [...(view?.now ?? []), ...(view?.next ?? []), ...(state.plan?.sessions ?? [])])
      map[s.id] = s;
    return map;
  }, [eventId, view, state.plan]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = interests.trim();
    if (!text) return;
    setPrefs({ interests: text }, { mirror: false });
    setState({ status: 'loading' });
    try {
      const plan = await api.post<PlanResponse>(
        `/events/${encodeURIComponent(eventId)}/plan-my-day`,
        { interests: text },
      );
      setState({ status: 'done', plan });
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof ApiError ? err.message : 'Could not build a plan right now.',
      });
    }
  };

  const items = (state.plan?.plan ?? []).map((p) => ({ ...p, session: known[p.sessionId] }));
  const addable = items.map((i) => i.session).filter((s): s is Session => Boolean(s));
  const allAdded = addable.length > 0 && addable.every((s) => schedule.has(s.id));

  return (
    <div className="at-page">
      <AttendeeHeader title="Plan my day" handle={me?.handle} back />
      <main id="main" className="at-main">
        <form onSubmit={(e) => void submit(e)}>
          <label htmlFor="plan-interests" className="at-label">
            What are you here for?
          </label>
          <textarea
            id="plan-interests"
            className="at-textarea"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            maxLength={500}
            placeholder="e.g. eBPF for security, GitOps at scale, anything on OpenTelemetry costs"
            required
          />
          <div className="at-sheet__actions">
            <button
              type="submit"
              className="at-btn at-btn--primary"
              disabled={state.status === 'loading' || !interests.trim()}
            >
              {state.status === 'loading' ? 'Planning…' : 'Build my day'}
            </button>
            <span className="at-muted">Uses the talk catalogue, cites every pick.</span>
          </div>
        </form>

        <p role="status" aria-live="polite" className="at-muted">
          {state.status === 'loading'
            ? 'Reading the schedule and picking talks that fit together…'
            : ''}
        </p>

        {state.status === 'error' && (
          <div role="alert" className="at-error">
            <p>{state.error}</p>
          </div>
        )}

        {state.status === 'done' && state.plan && (
          <section aria-labelledby="plan-h" className="at-section">
            <h2 id="plan-h">Your plan</h2>
            <p className="at-plan-summary">{state.plan.summary}</p>
            {addable.length > 0 && (
              <button
                type="button"
                className="at-btn at-btn--primary at-block"
                aria-pressed={allAdded}
                onClick={() => schedule.add(addable)}
                disabled={allAdded}
              >
                {allAdded ? '✓ All in my schedule' : `Add all ${addable.length} to my schedule`}
              </button>
            )}
            <div className="at-list" style={{ marginTop: 'var(--space-3)' }}>
              {items.map((it) =>
                it.session ? (
                  <SessionCard
                    key={it.sessionId}
                    session={it.session}
                    room={roomById(view?.rooms, it.session.roomId)}
                    tz={view?.event.timezone}
                    reason={it.reason}
                    saved={schedule.has(it.sessionId)}
                    onToggleSave={schedule.toggle}
                  />
                ) : (
                  <article key={it.sessionId} className="at-card">
                    <p className="at-card__reason">{it.reason}</p>
                    <p className="at-muted">
                      Session details are loading.{' '}
                      <Link
                        to={`/a/search?q=${encodeURIComponent(it.reason.split(/[.,]/)[0] ?? '')}`}
                      >
                        Find it in search
                      </Link>
                    </p>
                  </article>
                ),
              )}
            </div>
            {items.length === 0 && (
              <p className="at-muted">
                No talks matched well enough. Try describing one topic at a time.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
