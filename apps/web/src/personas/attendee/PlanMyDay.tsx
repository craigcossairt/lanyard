import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { formatRange, type PlanMyDayResponse, type Session } from '@lanyard/contracts';
import { Banner, Button, Card, EmptyState, LivePill, StatusPill, TextArea } from '../../ui';
import { AttendeeHeader } from './components/AttendeeHeader';
import { api, ApiError } from './lib/api';
import { roomById, useEventView } from './lib/event';
import { usePrefs } from './lib/prefs';
import { cachedSessions, useMySchedule } from './lib/schedule';
import { useEventId, useSession } from './lib/session';

/**
 * WS1's contract (#93): 200 → { plan, summary, sessions: PlanSession[] } with
 * PlanSession = Session & { roomName }, ordered 1:1 with `plan`; the summary already carries
 * event-local times. 202 → { plan: [], sessions: [], summary: 'Preparing your day plan…' }
 * with Retry-After: 2. Fields are read defensively so an older 200 shape still renders.
 */
interface PlanSession {
  id: string;
  title?: string;
  roomName?: string;
  roomId?: string;
  startsAt?: string;
  endsAt?: string;
  track?: string;
  speakerNames?: string[];
  status?: Session['status'];
}
type PlanResponse = PlanMyDayResponse & { sessions?: PlanSession[] };

const PENDING_RETRIES = 6;
const PENDING_RETRY_MS = 2_000;
/** The 202 shape: nothing planned yet and a "Preparing…" summary. */
const isPending = (r: PlanResponse) =>
  r.plan.length === 0 && (r.sessions?.length ?? 0) === 0 && /preparing/i.test(r.summary);

/** A card's data: a full Session when we know it, else what the plan response gave us. */
interface CardData {
  session: Session;
  roomName?: string;
  reason?: string;
}

function toSession(eventId: string, p: PlanSession, known?: Session): Session {
  if (known) return known;
  return {
    id: p.id,
    eventId,
    roomId: p.roomId ?? '',
    title: p.title ?? 'Session',
    abstract: '',
    track: p.track ?? '',
    level: '',
    tags: [],
    speakerIds: [],
    speakerNames: p.speakerNames ?? [],
    startsAt: p.startsAt ?? '',
    endsAt: p.endsAt ?? '',
    status: p.status ?? 'scheduled',
  };
}

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
    pending?: string;
    error?: string;
  }>({ status: 'idle' });
  const tz = view?.event.timezone;

  const known = useMemo(() => {
    const map: Record<string, Session> = { ...cachedSessions(eventId) };
    for (const s of [...(view?.now ?? []), ...(view?.next ?? [])]) map[s.id] = s;
    return map;
  }, [eventId, view]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = interests.trim();
    if (!text) return;
    setPrefs({ interests: text }, { mirror: false });
    setState({ status: 'loading' });
    try {
      let plan: PlanResponse | null = null;
      // The API answers 202 "Preparing…" (empty plan, Retry-After: 2) while the worker runs.
      for (let attempt = 0; attempt < PENDING_RETRIES; attempt += 1) {
        const res = await api.post<PlanResponse>(
          `/events/${encodeURIComponent(eventId)}/plan-my-day`,
          { interests: text },
        );
        if (!isPending(res)) {
          plan = res;
          break;
        }
        setState({ status: 'loading', pending: res.summary });
        await new Promise((r) => setTimeout(r, PENDING_RETRY_MS));
      }
      if (!plan) {
        setState({ status: 'error', error: 'Still preparing your plan. Try again in a moment.' });
        return;
      }
      setState({ status: 'done', plan });
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof ApiError ? err.message : 'Could not build a plan right now.',
      });
    }
  };

  // Planned sessions: response `sessions` first, then anything the device already knows.
  const planned = useMemo<CardData[]>(() => {
    const plan = state.plan;
    if (!plan) return [];
    const byId = new Map((plan.sessions ?? []).map((s) => [s.id, s]));
    return plan.plan.flatMap((p) => {
      const fromApi = byId.get(p.sessionId);
      const fromDevice = known[p.sessionId];
      if (!fromApi && !fromDevice) return [];
      const session = toSession(eventId, fromApi ?? { id: p.sessionId }, fromDevice);
      const roomName = fromApi?.roomName ?? roomById(view?.rooms, session.roomId)?.name;
      return [{ session, roomName, reason: p.reason }];
    });
  }, [state.plan, known, eventId, view?.rooms]);
  const unresolved = (state.plan?.plan ?? []).filter(
    (p) => !planned.some((c) => c.session.id === p.sessionId),
  );

  // My schedule: time-ordered, from the device cache plus anything on screen.
  const mine = useMemo<CardData[]>(() => {
    const all: Record<string, Session> = { ...known };
    for (const c of planned) all[c.session.id] = c.session;
    return schedule.sessionIds
      .map((id) => all[id])
      .filter((s): s is Session => Boolean(s))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((session) => ({ session, roomName: roomById(view?.rooms, session.roomId)?.name }));
  }, [schedule.sessionIds, known, planned, view?.rooms]);

  const addable = planned.map((c) => c.session);
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
              {state.status === 'loading'
                ? 'Planning…'
                : state.status === 'done'
                  ? 'Plan again'
                  : 'Build my day'}
            </Button>
            <span className="ly-muted">Uses the talk catalogue, cites every pick.</span>
          </div>
        </form>

        <p role="status" aria-live="polite" className="ly-muted">
          {state.status === 'loading'
            ? (state.pending ?? 'Reading the schedule and picking talks that fit together…')
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
            {addable.length > 1 && (
              <Button
                variant="primary"
                block
                aria-pressed={allAdded}
                disabled={allAdded}
                onClick={() => schedule.add(addable)}
              >
                {allAdded ? 'All in my schedule' : `Add all ${addable.length} to my schedule`}
              </Button>
            )}
            <div className="at-list" style={{ marginTop: 'var(--space-3)' }}>
              {planned.map((c) => (
                <PlanCard
                  key={c.session.id}
                  data={c}
                  tz={tz}
                  saved={schedule.has(c.session.id)}
                  onToggle={() => schedule.toggle(c.session)}
                />
              ))}
              {unresolved.map((p) => (
                <Card as="article" key={p.sessionId} className="at-card">
                  <p className="at-card__reason">{p.reason}</p>
                  <p className="ly-muted">
                    Session details are loading.{' '}
                    <Link to={`/a/search?q=${encodeURIComponent(p.reason.split(/[.,]/)[0] ?? '')}`}>
                      Find it in search
                    </Link>
                  </p>
                </Card>
              ))}
            </div>
            {state.plan.plan.length === 0 && (
              <p className="ly-muted">
                No talks matched well enough. Try describing one topic at a time.
              </p>
            )}
          </section>
        )}

        <section aria-labelledby="mine-h" className="at-section">
          <h2 id="mine-h">My schedule</h2>
          {mine.length === 0 ? (
            <EmptyState title="Nothing saved yet">
              Add talks from your plan above, or from <Link to="/a/search">search</Link>. They show
              here in time order.
            </EmptyState>
          ) : (
            <div className="at-list">
              {mine.map((c) => (
                <PlanCard
                  key={c.session.id}
                  data={c}
                  tz={tz}
                  saved
                  removable
                  onToggle={() => schedule.toggle(c.session)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function PlanCard({
  data,
  tz,
  saved,
  removable,
  onToggle,
}: {
  data: CardData;
  tz?: string;
  saved: boolean;
  removable?: boolean;
  onToggle: () => void;
}) {
  const { session, roomName, reason } = data;
  const live = session.status === 'live';
  // A session can appear in both Your plan and My schedule: ids must be unique per card.
  const headingId = useId();
  const when =
    session.startsAt && session.endsAt ? formatRange(session.startsAt, session.endsAt, tz) : '';
  return (
    <Card as="article" className="at-card" aria-labelledby={headingId}>
      <div className="at-card__meta ly-muted">
        {when && <span>{when}</span>}
        {roomName && <span>· {roomName}</span>}
        {live && <LivePill />}
      </div>
      <h3 id={headingId} className="at-card__title">
        {live ? (
          <Link to={`/a/s/${encodeURIComponent(session.id)}`}>{session.title}</Link>
        ) : (
          session.title
        )}
      </h3>
      {session.speakerNames.length > 0 && (
        <p className="at-card__speakers ly-muted">{session.speakerNames.join(', ')}</p>
      )}
      {reason && <p className="at-card__reason">{reason}</p>}
      <div className="at-card__actions">
        {session.track && <StatusPill>{session.track}</StatusPill>}
        {removable ? (
          <Button variant="ghost" onClick={onToggle} aria-label={`Remove ${session.title}`}>
            Remove
          </Button>
        ) : (
          <Button aria-pressed={saved} onClick={onToggle}>
            {saved ? 'In my schedule' : 'Add to my schedule'}
          </Button>
        )}
        {live && (
          <Link className="ly-btn ly-btn--primary" to={`/a/s/${encodeURIComponent(session.id)}`}>
            Join live
          </Link>
        )}
      </div>
    </Card>
  );
}
