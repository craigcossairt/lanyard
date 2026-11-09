// Attendee locale. UI strings are English or Spanish. The caption language is the
// same value, stored at lanyard.personal.language so WS3 settings and a future
// caption translator share one key. Caption text is never logged here.
import { es, en, type MessageKey } from './messages';

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** Fired after the stored language changes. Same-tab listeners will not see a storage event. */
export const LOCALE_EVENT = 'lanyard-locale';

/** WS3 display settings write this object. Merge; do not replace interests. */
export const PERSONAL_KEY = 'lanyard.personal';

const catalogs: Record<Locale, Record<MessageKey, string>> = { en, es };

export function toUiLocale(raw: string | null | undefined): Locale {
  const base = (raw ?? '').toLowerCase().split('-')[0];
  return base === 'es' ? 'es' : 'en';
}

export function formatMessage(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] === undefined ? '' : String(vars[key]),
  );
}

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>) {
  return formatMessage(catalogs[locale][key], vars);
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readPersonal(): Record<string, unknown> {
  const raw = storage()?.getItem(PERSONAL_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function readStoredLanguage(): string | null {
  const value = readPersonal().language;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 16) : null;
}

export function readLocale(): Locale {
  const stored = readStoredLanguage();
  if (stored) return toUiLocale(stored);
  if (typeof navigator !== 'undefined') return toUiLocale(navigator.language);
  return 'en';
}

/** Language a future caption translator should target. May be a code we do not have UI strings for. */
export function readCaptionLanguage(): string {
  return readStoredLanguage() ?? readLocale();
}

export interface LocaleSnapshot {
  ui: Locale;
  caption: string;
}

let snapshot: LocaleSnapshot = { ui: 'en', caption: 'en' };

export function readLocaleSnapshot(): LocaleSnapshot {
  const caption = readCaptionLanguage();
  const ui = readLocale();
  if (snapshot.ui === ui && snapshot.caption === caption) return snapshot;
  snapshot = { ui, caption };
  return snapshot;
}

export function applyDocumentLocale(locale: Locale = readLocale()): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
}

export function writeLocale(locale: Locale): void {
  const store = storage();
  try {
    store?.setItem(PERSONAL_KEY, JSON.stringify({ ...readPersonal(), language: locale }));
  } catch {
    // Private mode: this visit only.
  }
  snapshot = { ui: locale, caption: locale };
  applyDocumentLocale(locale);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCALE_EVENT));
}

export function subscribeLocale(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === PERSONAL_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(LOCALE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(LOCALE_EVENT, onChange);
  };
}

export interface CaptionTranslation {
  text: string;
  from: string;
  to: string;
}

type CaptionTranslator = (request: CaptionTranslation) => string;

let captionTranslator: CaptionTranslator | null = null;

/** P1 caption translation registers here. Unset, captions stay in the speaker’s language. */
export function setCaptionTranslator(translator: CaptionTranslator | null): void {
  captionTranslator = translator;
}

function languageBase(raw: string): string {
  return raw.toLowerCase().split('-')[0] ?? '';
}

export function translateCaption(
  text: string,
  from: string,
  to: string = readCaptionLanguage(),
): string {
  if (!captionTranslator || languageBase(from) === languageBase(to)) return text;
  const translated = captionTranslator({ text, from, to });
  return translated.trim() ? translated : text;
}
