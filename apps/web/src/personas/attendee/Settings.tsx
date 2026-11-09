import { useState } from 'react';
import { Button, TextArea } from '../../ui';
import { AttendeeHeader } from './components/AttendeeHeader';
import { DisplayPrefsPanel } from './components/DisplayPrefsPanel';
import { usePrefs } from './lib/prefs';
import { useSession } from './lib/session';

const LANGUAGES: Array<[string, string]> = [
  ['en', 'English'],
  ['es', 'Español'],
  ['pt', 'Português'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['ja', '日本語'],
  ['zh', '中文'],
  ['hi', 'हिन्दी'],
];

export default function Settings() {
  const me = useSession();
  const { prefs, setPrefs } = usePrefs();
  const [interests, setInterests] = useState(prefs.interests);
  const [share, setShare] = useState(prefs.shareInterests);
  const [saved, setSaved] = useState(false);

  const saveInterests = (e: React.FormEvent) => {
    e.preventDefault();
    // Saving is the opt-in moment: interests reach the server only with the box ticked.
    setPrefs({ interests: interests.trim(), shareInterests: share });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="at-page">
      <AttendeeHeader title="Display & access" handle={me?.handle} back />
      <main id="main" className="at-main">
        <p className="ly-muted">Changes apply instantly and follow you on this device.</p>

        <section className="at-fieldset" aria-labelledby="display-h">
          <h2 id="display-h" className="at-label">
            Display
          </h2>
          <DisplayPrefsPanel />
          <p className="at-preview" aria-hidden="true">
            Captions look like this.
          </p>
        </section>

        <div className="at-fieldset">
          <label htmlFor="lang" className="at-label">
            Language
          </label>
          <select
            id="lang"
            className="ly-input"
            value={prefs.language}
            onChange={(e) => setPrefs({ language: e.target.value })}
          >
            {LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <p className="ly-muted at-hint">Used for caption translation when a session offers it.</p>
        </div>

        <form className="at-fieldset" onSubmit={saveInterests}>
          <TextArea
            label="Interests (optional, opt-in)"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            maxLength={500}
            placeholder="e.g. eBPF, platform engineering, running Postgres on Kubernetes"
            hint="Unticked, interests stay on this device. Never shown with your handle either way."
          />
          <label className="at-check">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
            Share my interests with the event to plan my day and suggest booths
          </label>
          <div className="at-sheet__actions">
            <Button variant="primary" type="submit">
              Save interests
            </Button>
            <span role="status" className="ly-muted">
              {saved ? 'Saved' : ''}
            </span>
          </div>
        </form>
      </main>
    </div>
  );
}
