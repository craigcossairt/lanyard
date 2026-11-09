import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { PlanMyDayResponse, Session } from '@lanyard/contracts';
import { Banner, Button, Card, TextArea } from '../../ui';
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
          <TextArea
            label="What are you here for?"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            maxLength={500}
            placeholder="e.g. eBPF for security, GitOps at scale, anything on OpenTelemetry costs"
            required
          />
          <div className="at-sheet__actions">
            <Button
              variant="primary"
              type="submit"
              disabled={state.status === 'loading' || !interests.trim()}
            >
              {state.status === 'loading' ? 'Planning…' : 'Build my day'}
            </Button>
            <span className="ly-muted">Uses the talk catalogue, cites every pick.</span>
          </div>
        </form>

        <p role="status" aria-live="polite" className="ly-muted">
          {state.status === 'loading'
            ? 'Reading the schedule and picking talks that fit together…'
            : ''}
        </p>

        {state.status === 'error' && (
          <Banner tone="warn" icon="warn">
            {state.error}
          </Banner>
        )}

        {state.status === 'done' && state.plan && (
          <section aria-labelledby="plan-h" className="at-section">
            <h2 id="plan-h">Your plan</h2>
            <p className="at-plan-summary">{state.plan.summary}</p>
            {addable.length > 0 && (
              <Button
                variant="primary"
                block
                aria-pressed={allAdded}
                onClick={() => schedule.add(addable)}
                disabled={allAdded}
              >
                {allAdded ? 'All in my schedule' : `Add all ${addable.length} to my schedule`}
              </Button>
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
                  <Card as="article" key={it.sessionId} className="at-card">
                    <p className="at-card__reason">{it.reason}</p>
                    <p className="ly-muted">
                      Session details are loading.{' '}
                      <Link
                        to={`/a/search?q=${encodeURIComponent(it.reason.split(/[.,]/)[0] ?? '')}`}
                      >
                        Find it in search
                      </Link>
                    </p>
                  </Card>
                ),
              )}
            </div>
            {items.length === 0 && (
              <p className="ly-muted">
                No talks matched well enough. Try describing one topic at a time.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
