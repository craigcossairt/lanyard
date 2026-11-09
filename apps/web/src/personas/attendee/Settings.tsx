import { useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
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
const THEMES: Array<DisplayPrefs['theme']> = ['dark', 'light', 'contrast'];
const THEME_KEY = {
  dark: 'themeDark',
  light: 'themeLight',
  contrast: 'themeContrast',
} as const;
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
  const { t } = useI18n();
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
      <AttendeeHeader title={t('displayAccess')} handle={me?.handle} back />
      <main id="main" tabIndex={-1} className="at-main">
        <p className="at-muted">{t('settingsLead')}</p>

        <fieldset className="at-fieldset">
          <legend>{t('captionSizeLegend')}</legend>
          <div className="at-choices">
            {SIZES.map(([v, label]) => (
              <button
                key={v}
                type="button"
                className="at-btn"
                aria-pressed={prefs.captionSize === v}
                aria-label={t('captionSizeName', { size: label })}
                onClick={() => setPrefs({ captionSize: v })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="at-preview" aria-hidden="true">
            {t('captionPreview')}
          </p>
        </fieldset>

        <fieldset className="at-fieldset">
          <legend>{t('colours')}</legend>
          <div className="at-choices">
            {THEMES.map((v) => (
              <button
                key={v}
                type="button"
                className="at-btn"
                aria-pressed={prefs.theme === v}
                onClick={() => setPrefs({ theme: v })}
              >
                {t(THEME_KEY[v])}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="at-fieldset">
          <legend>{t('readingMotion')}</legend>
          <div className="at-choices at-choices--stack">
            <button
              type="button"
              className="at-btn"
              aria-pressed={prefs.readable}
              onClick={() => setPrefs({ readable: !prefs.readable })}
            >
              {prefs.readable ? '✓ ' : ''}
              {t('readableFont')}
            </button>
            <button
              type="button"
              className="at-btn"
              aria-pressed={prefs.reduceMotion}
              onClick={() => setPrefs({ reduceMotion: !prefs.reduceMotion })}
            >
              {prefs.reduceMotion ? '✓ ' : ''}
              {t('reduceMotion')}
            </button>
          </div>
        </fieldset>

        <div className="at-fieldset">
          <label htmlFor="lang" className="at-label">
            {t('langLabel')}
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
          <p className="at-muted at-hint">{t('langHint')}</p>
        </div>

        <form className="at-fieldset" onSubmit={saveInterests}>
          <label htmlFor="interests" className="at-label">
            {t('interestsLabel')}
          </label>
          <textarea
            id="interests"
            className="at-textarea"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            maxLength={500}
            placeholder={t('interestsPlaceholder')}
          />
          <label className="at-check">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
            {t('interestsShare')}
          </label>
          <p className="at-muted at-hint">{t('interestsHint')}</p>
          <div className="at-sheet__actions">
            <button type="submit" className="at-btn at-btn--primary">
              {t('saveInterests')}
            </button>
            <span role="status" className="at-muted">
              {saved ? t('saved') : ''}
            </span>
          </div>
        </form>
      </main>
    </div>
  );
}
