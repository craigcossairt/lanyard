import { useCallback, useEffect, useState } from 'react';
import type {
  MyNetworkingResponse,
  NetworkingSuggestionsResponse,
} from '@lanyard/contracts';
import { api, ApiError } from '../../../app/api';
import { Button, Card, TextArea, TextInput } from '../../../ui';
import { AttendeeHeader } from '../components/AttendeeHeader';
import { useEventId, useSession } from '../lib/session';
import './network.css';

const emptyProfile = { linkedinUrl: '', needs: '', offers: '', interests: '' };
type Profile = typeof emptyProfile;

function message(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Networking is temporarily unavailable. Please try again.';
}

export default function MeetPeople() {
  const eventId = useEventId();
  const me = useSession();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [optedIn, setOptedIn] = useState(false);
  const [optInSelected, setOptInSelected] = useState(false);
  const [matches, setMatches] = useState<NetworkingSuggestionsResponse['matches']>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const loadMatches = useCallback(async () => {
    const result = await api.get<NetworkingSuggestionsResponse>(
      `/events/${encodeURIComponent(eventId)}/networking/suggestions`,
    );
    setMatches(result.matches);
  }, [eventId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get<MyNetworkingResponse>('/me/networking')
      .then(async (result) => {
        if (!active) return;
        setOptedIn(result.optedIn);
        setOptInSelected(result.optedIn);
        if (result.optedIn) {
          setProfile(result.profile);
          await loadMatches();
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(message(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadMatches]);

  const updateProfile = (key: keyof Profile, value: string) =>
    setProfile((current) => ({ ...current, [key]: value }));

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setStatus('');
    try {
      await api.put('/me/networking', profile);
      setOptedIn(true);
      setOptInSelected(true);
      setStatus('You’re opted in. Only other opted-in attendees can see your match card.');
      try {
        await loadMatches();
      } catch {
        setError('Your profile was saved, but suggestions could not load. Try refreshing.');
      }
    } catch (reason) {
      setError(message(reason));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError('');
    try {
      await api.del('/me/networking');
      setOptedIn(false);
      setOptInSelected(false);
      setMatches([]);
      setProfile(emptyProfile);
      setStatus('Your networking profile was removed.');
    } catch (reason) {
      setError(message(reason));
    } finally {
      setSaving(false);
    }
  };

  const toggleOptIn = (checked: boolean) => {
    if (checked) {
      setOptInSelected(true);
      setError('');
      setStatus('Save your profile to join the attendee match list.');
    } else if (optedIn) {
      void remove();
      return;
    } else {
      setOptInSelected(false);
    }
  };

  return (
    <div className="at-page">
      <AttendeeHeader title="Meet people" handle={me?.handle} back />
      <main id="main" className="at-main at-network">
        <p className="at-muted">
          Find opted-in attendees whose goals, offers, and interests connect with yours.
        </p>

        {error && <p role="alert" className="at-error">{error}</p>}
        <p className="at-network__consent">
          Your profile starts private. When you opt in, only other opted-in attendees at this event
          can see your handle and LinkedIn link on a match card. We never fetch your LinkedIn page.
          Turn this off any time to delete your profile.
        </p>

        {loading ? (
          <p role="status" className="at-muted">Loading your networking settings…</p>
        ) : (
          <>
            <Button
              className="at-network__toggle"
              type="button"
              aria-pressed={optInSelected}
              onClick={() => toggleOptIn(!optInSelected)}
              disabled={saving}
            >
              I want to meet people at this event
            </Button>

            {optInSelected && (
              <form className="at-network__form" onSubmit={save}>
                <TextInput
                  id="networking-linkedin"
                  label="LinkedIn profile URL"
                  type="url"
                  required
                  pattern="https://(www\.)?linkedin\.com/in/[A-Za-z0-9-]+"
                  title="Use https://www.linkedin.com/in/your-slug"
                  autoComplete="url"
                  value={profile.linkedinUrl}
                  onChange={(event) => updateProfile('linkedinUrl', event.currentTarget.value)}
                  placeholder="https://www.linkedin.com/in/your-slug"
                />
                <TextArea
                  id="networking-needs"
                  label="Who would you like to meet?"
                  required
                  maxLength={240}
                  value={profile.needs}
                  onChange={(event) => updateProfile('needs', event.currentTarget.value)}
                  placeholder="People building reliable AI platforms"
                />
                <TextArea
                  id="networking-offers"
                  label="What can you help with?"
                  required
                  maxLength={240}
                  value={profile.offers}
                  onChange={(event) => updateProfile('offers', event.currentTarget.value)}
                  placeholder="Lessons from running Kubernetes at scale"
                />
                <TextInput
                  id="networking-interests"
                  label="Interests"
                  required
                  maxLength={500}
                  value={profile.interests}
                  onChange={(event) => updateProfile('interests', event.currentTarget.value)}
                  placeholder="OpenTelemetry, platform engineering"
                />
                <div className="at-network__actions">
                  <Button type="submit" variant="primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Save my profile'}
                  </Button>
                  <Button type="button" variant="danger" onClick={() => void remove()} disabled={saving}>
                    Remove me
                  </Button>
                </div>
              </form>
            )}

            <section aria-labelledby="matches-heading" className="at-section at-network__matches">
              <h2 id="matches-heading">People to meet</h2>
              {!optedIn ? (
                <p className="at-muted">Opt in and save your profile to see attendee suggestions.</p>
              ) : matches.length === 0 ? (
                <p className="at-muted" aria-live="polite">No matches yet. Check back as more attendees opt in.</p>
              ) : (
                <ul className="at-network__list" aria-live="polite">
                  {matches.map((match) => (
                    <Card as="li" className="at-network__match" key={`${match.handle}:${match.linkedinUrl}`}>
                      <h3 className="at-card__title">{match.handle}</h3>
                      <p className="at-card__why">{match.reason}</p>
                      <a href={match.linkedinUrl} target="_blank" rel="noreferrer">
                        View LinkedIn profile <span className="at-sr-only">for {match.handle}</span>
                      </a>
                    </Card>
                  ))}
                </ul>
              )}
            </section>
            <p role="status" aria-live="polite" className="at-muted">{status}</p>
          </>
        )}
      </main>
    </div>
  );
}
