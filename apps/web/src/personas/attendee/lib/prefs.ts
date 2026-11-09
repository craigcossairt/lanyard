// Display and accessibility prefs. Display prefs (theme, caption size, readable, motion)
// live in the shell's store (apps/web/src/app/theme.ts, key `lanyard.prefs`), which
// applies them to <html>. Language and interests are kept here. Everything the person
// changes is mirrored to PUT /me/prefs; interests only after an explicit opt-in. Prefs
// are never logged.
import { useCallback, useSyncExternalStore } from 'react';
import type { AccessibilityPrefs, PrefsRequest } from '@lanyard/contracts';
import { applyRootPrefs, loadPrefs, setRootPrefs } from '../../../app/theme';
import { LOCALE_EVENT } from '../../../i18n/locale';
import { api } from './api';

export interface DisplayPrefs {
  theme: 'dark' | 'light' | 'contrast';
  captionSize: 's' | 'm' | 'l' | 'xl' | 'xxl';
  readable: boolean;
  reduceMotion: boolean;
}
export interface PersonalPrefs {
  language: string;
  /** Free text, kept on the device for Plan my day. */
  interests: string;
  /** Opt-in: only when true do interests ever leave the device (PUT /me/prefs). */
  shareInterests: boolean;
}
export type Prefs = DisplayPrefs & PersonalPrefs;

const PERSONAL_KEY = 'lanyard.personal';

const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches;

function displayDefaults(): DisplayPrefs {
  return {
    theme: media('(prefers-contrast: more)') ? 'contrast' : 'dark',
    captionSize: 'l',
    readable: false,
    reduceMotion: media('(prefers-reduced-motion: reduce)'),
  };
}
function personalDefaults(): PersonalPrefs {
  return {
    language: (typeof navigator !== 'undefined' && navigator.language.split('-')[0]) || 'en',
    interests: '',
    shareInterests: false,
  };
}

let current: Prefs | null = null;
const listeners = new Set<() => void>();

function read(): Prefs {
  if (current) return current;
  const display = loadPrefs();
  let personal: Partial<PersonalPrefs> | null = null;
  try {
    personal = JSON.parse(
      localStorage.getItem(PERSONAL_KEY) ?? 'null',
    ) as Partial<PersonalPrefs> | null;
  } catch {
    personal = null;
  }
  const d = displayDefaults();
  current = {
    theme: display.theme ?? d.theme,
    captionSize: display.captionSize ?? d.captionSize,
    readable: display.readable ?? d.readable,
    reduceMotion: display.reduceMotion ?? d.reduceMotion,
    ...personalDefaults(),
    ...personal,
  };
  return current;
}

/** Re-apply the shell's root attributes (main.tsx does this at startup too). */
export function applyPrefs(): void {
  applyRootPrefs();
}

function write(next: Prefs, mirror: boolean): void {
  current = next;
  const { theme, captionSize, readable, reduceMotion, language, interests, shareInterests } = next;
  const accessibility: AccessibilityPrefs = { theme, captionSize, readable, reduceMotion };
  setRootPrefs(accessibility);
  try {
    localStorage.setItem(PERSONAL_KEY, JSON.stringify({ language, interests, shareInterests }));
  } catch {
    // Private mode: this visit only.
  }
  listeners.forEach((l) => l());
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOCALE_EVENT));
  if (mirror) {
    const body: PrefsRequest = {
      accessibility,
      language,
      // Interests are sent only after the person explicitly opted in on Settings.
      ...(shareInterests && interests.trim() ? { interests: interests.trim() } : {}),
    };
    void api.put('/me/prefs', body).catch(() => undefined);
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

if (typeof window !== 'undefined') {
  window.addEventListener(LOCALE_EVENT, () => {
    if (!current) return;
    let language = current.language;
    try {
      const parsed = JSON.parse(localStorage.getItem(PERSONAL_KEY) ?? 'null') as {
        language?: unknown;
      } | null;
      if (parsed && typeof parsed.language === 'string') language = parsed.language;
    } catch {
      return;
    }
    if (language === current.language) return;
    current = { ...current, language };
    listeners.forEach((l) => l());
  });
}

export function usePrefs() {
  const prefs = useSyncExternalStore(subscribe, read, read);
  const setPrefs = useCallback((patch: Partial<Prefs>, opts: { mirror?: boolean } = {}) => {
    write({ ...read(), ...patch }, opts.mirror ?? true);
  }, []);
  return { prefs, setPrefs };
}
