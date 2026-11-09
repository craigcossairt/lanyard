// /join: role links land here as /join#t=<token> (captured in main.tsx before RUM);
// attendees join an event by picking it or entering its join code.
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { EVENT_IDS } from '@lanyard/contracts';
import { Button, TextInput } from '../ui';
import { ApiError, api } from './api';
import { homeFor, saveToken } from './auth';
import { EVENT_NAMES, Wordmark } from './brand';
import { useSession } from './session';

export function JoinPage() {
  const session = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [eventId, setEventId] = useState(params.get('event') ?? EVENT_IDS.cnhDemos);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (session && !params.has('again'))
    return <Navigate to={homeFor(session.claims.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.join(
        code.trim() || eventId,
        code.trim() ? { joinCode: code.trim() } : {},
      );
      saveToken(res.token);
      navigate(homeFor(res.role), { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'We couldn’t find that event or join code. Check it and try again.'
          : err instanceof ApiError
            ? err.message
            : 'Couldn’t join just now. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page join" id="main">
      <header className="page__brand">
        <Link to="/" aria-label="Lanyard home" className="wordmark-link">
          <Wordmark />
        </Link>
      </header>
      <h1>Join an event</h1>
      <form onSubmit={submit} className="stack">
        <label className="join__label">
          Event
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {Object.entries(EVENT_NAMES).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <TextInput
          label="Or a join code"
          hint="Printed on the room screen. Leave empty to join the event above."
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
        />
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? 'Joining…' : 'Join anonymously'}
        </Button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
      <p className="page__foot muted">No sign-up and no personal data: you get a random handle.</p>
    </main>
  );
}
