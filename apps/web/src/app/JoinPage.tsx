// /join: role links land here as /join#t=<token> (captured in main.tsx before RUM);
// attendees join an event by picking it or entering its join code.
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { EVENT_IDS } from '@lanyard/contracts';
import { LanguageSelect, useI18n } from '../i18n/useI18n';
import { ApiError, api } from './api';
import { homeFor, saveToken } from './auth';
import { useSession } from './session';

export function JoinPage() {
  const session = useSession();
  const { t } = useI18n();
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
      setError(err instanceof ApiError ? err.message : t('joinFail'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" tabIndex={-1} className="shell">
      <a href="#main" className="skip-link">
        {t('skip')}
      </a>
      <h1>{t('joinTitle')}</h1>
      <LanguageSelect id="join-lang" />
      <form onSubmit={submit} className="stack">
        <label>
          {t('joinEvent')}{' '}
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value={EVENT_IDS.cnhDemos}>CNH Demos</option>
            <option value={EVENT_IDS.kubecon}>KubeCon + CloudNativeCon NA 2026</option>
          </select>
        </label>
        <label>
          {t('joinCode')}{' '}
          <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? t('joinBusy') : t('joinSubmit')}
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
      <p className="muted">{t('joinNote')}</p>
    </main>
  );
}
