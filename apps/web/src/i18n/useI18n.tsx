import { useCallback, useSyncExternalStore } from 'react';
import type { MessageKey } from './messages';
import {
  applyDocumentLocale,
  readLocaleSnapshot,
  subscribeLocale,
  translate,
  writeLocale,
  type Locale,
  type LocaleSnapshot,
} from './locale';

function subscribe(onChange: () => void) {
  return subscribeLocale(() => {
    applyDocumentLocale(readLocaleSnapshot().ui);
    onChange();
  });
}

export function useI18n() {
  const snap = useSyncExternalStore(subscribe, readLocaleSnapshot, serverSnapshot);
  applyDocumentLocale(snap.ui);
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(snap.ui, key, vars),
    [snap.ui],
  );
  return {
    locale: snap.ui,
    captionLanguage: snap.caption,
    setLocale: writeLocale,
    t,
  };
}

const SERVER_SNAPSHOT: LocaleSnapshot = { ui: 'en', caption: 'en' };

function serverSnapshot(): LocaleSnapshot {
  return SERVER_SNAPSHOT;
}

export function LanguageSelect({
  id = 'lanyard-lang',
  compact = false,
}: {
  id?: string;
  /** Hide the visible word and keep the accessible name. For tight headers. */
  compact?: boolean;
}) {
  const { locale, setLocale, t, captionLanguage } = useI18n();
  const extra = captionLanguage !== 'en' && captionLanguage !== 'es' ? captionLanguage : null;
  return (
    <label className={compact ? 'ly-lang ly-lang--compact' : 'ly-lang'} htmlFor={id}>
      <span className="ly-lang__label">{t('langLabel')}</span>
      <select
        id={id}
        value={extra ? captionLanguage : locale}
        onChange={(event) => {
          const next = event.target.value;
          if (next === 'en' || next === 'es') setLocale(next);
        }}
      >
        <option value="en">{t('langEn')}</option>
        <option value="es">{t('langEs')}</option>
        {extra && <option value={extra}>{extra}</option>}
      </select>
    </label>
  );
}

export type { Locale };
