import { useState } from 'react';
import { AttendeeHeader } from './components/AttendeeHeader';
import { usePrefs, type DisplayPrefs } from './lib/prefs';
import { useSession } from './lib/session';

const SIZES: Array<[DisplayPrefs['captionSize'], string]> = [
  ['s', 'S'],
  ['m', 'M'],
  ['l', 'L'],
  ['xl', 'XL'],
  ['xxl', 'XXL'],
];
const THEMES: Array<[DisplayPrefs['theme'], string]> = [
  ['dark', 'Dark'],
  ['light', 'Light'],
  ['contrast', 'High contrast'],
];
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
  const [saved, setSaved] = useState(false);

  const saveInterests = (e: React.FormEvent) => {
    e.preventDefault();
    setPrefs({ interests: interests.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="at-page">
      <AttendeeHeader title="Display & access" handle={me?.handle} back />
      <main id="main" className="at-main">
        <p className="at-muted">Changes apply instantly and follow you on this device.</p>

        <fieldset className="at-fieldset">
          <legend>Caption and text size</legend>
          <div className="at-choices">
            {SIZES.map(([v, label]) => (
              <button
                key={v}
                type="button"
                className="at-btn"
                aria-pressed={prefs.captionSize === v}
                aria-label={`Caption size ${label}`}
                onClick={() => setPrefs({ captionSize: v })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="at-preview" aria-hidden="true">
            Captions look like this.
          </p>
        </fieldset>

        <fieldset className="at-fieldset">
          <legend>Colours</legend>
          <div className="at-choices">
            {THEMES.map(([v, label]) => (
              <button
                key={v}
                type="button"
                className="at-btn"
                aria-pressed={prefs.theme === v}
                onClick={() => setPrefs({ theme: v })}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="at-fieldset">
          <legend>Reading and motion</legend>
          <div className="at-choices at-choices--stack">
            <button
              type="button"
              className="at-btn"
              aria-pressed={prefs.readable}
              onClick={() => setPrefs({ readable: !prefs.readable })}
            >
              {prefs.readable ? '✓ ' : ''}Easier-to-read spacing and font
            </button>
            <button
              type="button"
              className="at-btn"
              aria-pressed={prefs.reduceMotion}
              onClick={() => setPrefs({ reduceMotion: !prefs.reduceMotion })}
            >
              {prefs.reduceMotion ? '✓ ' : ''}Reduce motion
            </button>
          </div>
        </fieldset>

        <div className="at-fieldset">
          <label htmlFor="lang" className="at-label">
            Language
          </label>
          <select
            id="lang"
            className="at-input"
            value={prefs.language}
            onChange={(e) => setPrefs({ language: e.target.value })}
          >
            {LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <p className="at-muted at-hint">Used for caption translation when a session offers it.</p>
        </div>

        <form className="at-fieldset" onSubmit={saveInterests}>
          <label htmlFor="interests" className="at-label">
            Interests (optional, opt-in)
          </label>
          <textarea
            id="interests"
            className="at-textarea"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            maxLength={500}
            placeholder="e.g. eBPF, platform engineering, running Postgres on Kubernetes"
          />
          <p className="at-muted at-hint">
            Only used to plan your day and, if you choose, to match you with booths. Never shown
            with your handle.
          </p>
          <div className="at-sheet__actions">
            <button type="submit" className="at-btn at-btn--primary">
              Save interests
            </button>
            <span role="status" className="at-muted">
              {saved ? 'Saved' : ''}
            </span>
          </div>
        </form>
      </main>
    </div>
  );
}
