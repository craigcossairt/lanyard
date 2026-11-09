import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Session } from '@lanyard/contracts';
import { useI18n } from '../../i18n/useI18n';
import { SessionCard } from './components/SessionCard';
import { AttendeeHeader } from './components/AttendeeHeader';
import { roomById, useEventView } from './lib/event';
import { cachedSessions, rememberSessions, useMySchedule } from './lib/schedule';
import { useEventId, useSession } from './lib/session';

const MAX_NOW = 6;

export default function Home() {
  const { t } = useI18n();
  const eventId = useEventId();
  const me = useSession();
  const { view, error, loading, reload } = useEventView(eventId);
  const schedule = useMySchedule(eventId);
  const navigate = useNavigate();
  const tz = view?.event.timezone;

  useEffect(() => {
    if (view) rememberSessions(eventId, [...view.now, ...view.next]);
  }, [view, eventId]);

  const mine = useMemo<Session[]>(() => {
    const known = cachedSessions(eventId);
    for (const s of view?.now ?? []) known[s.id] = s;
    for (const s of view?.next ?? []) known[s.id] = s;
    return schedule.sessionIds
      .map((id) => known[id])
      .filter((s): s is Session => Boolean(s))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [schedule.sessionIds, view, eventId]);

  const onSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get('q');
    navigate(`/a/search?q=${encodeURIComponent(String(q ?? '').trim())}`);
  };

  return (
    <div className="at-page">
      <AttendeeHeader eventName={view?.event.name} handle={me?.handle} />
      <main id="main" tabIndex={-1} className="at-main">
        <form className="at-search" role="search" onSubmit={onSearch}>
          <label htmlFor="home-q" className="at-sr-only">
            {t('searchTalks')}
          </label>
          <input
            id="home-q"
            name="q"
            type="search"
            className="at-input"
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            enterKeyHint="search"
          />
          <button type="submit" className="at-btn at-btn--primary">
            {t('search')}
          </button>
        </form>

        <nav className="at-quick" aria-label={t('shortcuts')}>
          <Link className="at-quick__item" to="/a/plan">
            <span aria-hidden="true">✨</span> {t('planDay')}
          </Link>
          <Link className="at-quick__item" to="/a/settings">
            <span aria-hidden="true">Aa</span> {t('displayAccess')}
          </Link>
        </nav>

        {error && (
          <div role="alert" className="at-error">
            <p>{error}</p>
            <button type="button" className="at-btn" onClick={reload}>
              Try again
            </button>
          </div>
        )}

        <section aria-labelledby="now-h" className="at-section">
          <h2 id="now-h">{t('happeningNow')}</h2>
          {loading && !view && <p className="at-muted">{t('loadingSchedule')}</p>}
          {view && view.now.length === 0 && <p className="at-muted">{t('nothingLive')}</p>}
          <div className="at-list">
            {view?.now.slice(0, MAX_NOW).map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                room={roomById(view.rooms, s.roomId)}
                tz={tz}
                saved={schedule.has(s.id)}
                onToggleSave={schedule.toggle}
              />
            ))}
          </div>
          {view && view.now.length > MAX_NOW && (
            <p className="at-muted">
              {t('moreLive', { count: view.now.length - MAX_NOW })}{' '}
              <Link to="/a/search">{t('searchToFind')}</Link>
            </p>
          )}
        </section>

        <section aria-labelledby="next-h" className="at-section">
          <h2 id="next-h">{t('upNext')}</h2>
          {view && view.next.length === 0 && <p className="at-muted">{t('noMoreTalks')}</p>}
          <div className="at-list">
            {view?.next.slice(0, MAX_NOW).map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                room={roomById(view.rooms, s.roomId)}
                tz={tz}
                saved={schedule.has(s.id)}
                onToggleSave={schedule.toggle}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="mine-h" className="at-section">
          <h2 id="mine-h">{t('mySchedule')}</h2>
          {mine.length === 0 ? (
            <p className="at-muted">
              {t('nothingSaved')} <Link to="/a/plan">{t('planYourDay')}</Link>.
            </p>
          ) : (
            <div className="at-list">
              {mine.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  room={roomById(view?.rooms, s.roomId)}
                  tz={tz}
                  saved
                  onToggleSave={schedule.toggle}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
