import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { SearchResponse } from '@lanyard/contracts';
import { AttendeeHeader } from './components/AttendeeHeader';
import { SessionCard } from './components/SessionCard';
import { api, ApiError } from './lib/api';
import { roomById, useEventView } from './lib/event';
import { rememberSessions, useMySchedule } from './lib/schedule';
import { useEventId, useSession } from './lib/session';

const DEBOUNCE_MS = 250;
const EXAMPLES = [
  'eBPF but for security folks',
  'platform engineering without the toil',
  'observability on a budget',
];

export default function Search() {
  const eventId = useEventId();
  const me = useSession();
  const { view } = useEventView(eventId);
  const schedule = useMySchedule(eventId);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [draft, setDraft] = useState(q);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the URL as the source of truth, debounced from typing.
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = draft.trim();
      if (trimmed !== q) setParams(trimmed ? { q: trimmed } : {}, { replace: true });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [draft, q, setParams]);

  useEffect(() => {
    if (!q) {
      setResult(null);
      setStatus('idle');
      return;
    }
    let alive = true;
    // Results belong to one query: never show A's hits under B's heading.
    setResult(null);
    setStatus('loading');
    api
      .get<SearchResponse>(
        `/events/${encodeURIComponent(eventId)}/search?q=${encodeURIComponent(q)}`,
      )
      .then((r) => {
        if (!alive) return;
        setResult(r);
        setStatus('idle');
        setError(null);
        rememberSessions(
          eventId,
          r.hits.map((h) => h.session),
        );
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setStatus('error');
        setError(e instanceof ApiError ? e.message : 'Search is not available right now');
      });
    return () => {
      alive = false;
    };
  }, [q, eventId]);

  useEffect(() => {
    if (!q) inputRef.current?.focus();
  }, [q]);

  const hits = result?.hits ?? [];
  const summary =
    status === 'loading'
      ? 'Searching…'
      : q && result
        ? `${hits.length} ${hits.length === 1 ? 'talk' : 'talks'} for “${q}”`
        : '';

  return (
    <div className="at-page">
      <AttendeeHeader title="Find a talk" handle={me?.handle} back />
      <main id="main" className="at-main">
        <form
          className="at-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setParams(draft.trim() ? { q: draft.trim() } : {}, { replace: true });
          }}
        >
          <label htmlFor="search-q" className="at-sr-only">
            Search talks by topic, speaker or vibe
          </label>
          <input
            ref={inputRef}
            id="search-q"
            type="search"
            className="at-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Topic, speaker, or “eBPF but for security folks”"
            autoComplete="off"
            enterKeyHint="search"
          />
          <button type="submit" className="at-btn at-btn--primary">
            Search
          </button>
        </form>

        <p className="at-muted" role="status" aria-live="polite">
          {summary}
        </p>

        {!q && (
          <section aria-labelledby="try-h" className="at-section">
            <h2 id="try-h">Try asking for</h2>
            <ul className="at-examples">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button
                    type="button"
                    className="at-chip at-chip--button"
                    onClick={() => setDraft(ex)}
                  >
                    {ex}
                  </button>
                </li>
              ))}
            </ul>
            <p className="at-muted">
              Hybrid search: keywords plus meaning, so “security folks” still finds the eBPF runtime
              talk.
            </p>
          </section>
        )}

        {status === 'error' && (
          <div role="alert" className="at-error">
            <p>{error}</p>
          </div>
        )}

        {q && result && hits.length === 0 && status !== 'loading' && (
          <p className="at-muted">No talks matched. Try fewer words, or a topic like “GitOps”.</p>
        )}

        <div className="at-list" aria-busy={status === 'loading'}>
          {hits.map((h) => (
            <SessionCard
              key={h.session.id}
              session={h.session}
              room={roomById(view?.rooms, h.session.roomId)}
              tz={view?.event.timezone}
              highlights={h.highlights}
              saved={schedule.has(h.session.id)}
              onToggleSave={schedule.toggle}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
