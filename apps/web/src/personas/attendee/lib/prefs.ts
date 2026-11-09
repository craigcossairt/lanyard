// Display and accessibility prefs. Same localStorage key and shape as the design
// system's DisplayPrefsProvider (`lanyard.display`), so adopting it is a swap. Applied to
// <html> as data-theme / data-caption-size / data-readable / data-motion, and mirrored
// to PUT /me/prefs so they follow the person. Prefs are never logged.
import { useCallback, useSyncExternalStore } from 'react';
import type { PrefsRequest } from '@lanyard/contracts';
import { api } from './api';

export interface DisplayPrefs {
  theme: 'dark' | 'light' | 'contrast';
  captionSize: 's' | 'm' | 'l' | 'xl' | 'xxl';
  readable: boolean;
  reduceMotion: boolean;
}
export interface PersonalPrefs {
  language: string;
  /** Opt-in, free text. Only sent when the person saves it. */
  interests: string;
}
export type Prefs = DisplayPrefs & PersonalPrefs;

const DISPLAY_KEY = 'lanyard.display';
const PERSONAL_KEY = 'lanyard.personal';

const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches;

function defaults(): Prefs {
  return {
    theme: media('(prefers-contrast: more)') ? 'contrast' : 'dark',
    captionSize: 'l',
    readable: false,
    reduceMotion: media('(prefers-reduced-motion: reduce)'),
    language: (typeof navigator !== 'undefined' && navigator.language.split('-')[0]) || 'en',
    interests: '',
  };
}

let current: Prefs | null = null;
const listeners = new Set<() => void>();

function read(): Prefs {
  if (current) return current;
  const d = defaults();
  try {
    const display = JSON.parse(
      localStorage.getItem(DISPLAY_KEY) ?? 'null',
    ) as Partial<DisplayPrefs> | null;
    const personal = JSON.parse(
      localStorage.getItem(PERSONAL_KEY) ?? 'null',
    ) as Partial<PersonalPrefs> | null;
    current = { ...d, ...display, ...personal };
  } catch {
    current = d;
  }
  return current;
}

/** Set the <html> attributes the theme reads. Safe to call before React renders. */
export function applyPrefs(p: DisplayPrefs = read()): void {
  const el = document.documentElement.dataset;
  el.theme = p.theme;
  el.captionSize = p.captionSize;
  el.readable = String(p.readable);
  el.motion = p.reduceMotion ? 'reduce' : 'full';
}

function write(next: Prefs, mirror: boolean): void {
  current = next;
  const { theme, captionSize, readable, reduceMotion, language, interests } = next;
  try {
    localStorage.setItem(
      DISPLAY_KEY,
      JSON.stringify({ theme, captionSize, readable, reduceMotion }),
    );
    localStorage.setItem(PERSONAL_KEY, JSON.stringify({ language, interests }));
  } catch {
    // Private mode: this visit only.
  }
  applyPrefs(next);
  listeners.forEach((l) => l());
  if (mirror) {
    const body: PrefsRequest = {
      accessibility: { theme, captionSize, readable, reduceMotion },
      language,
      ...(interests.trim() ? { interests: interests.trim() } : {}),
    };
    void api.put('/me/prefs', body).catch(() => undefined);
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePrefs() {
  const prefs = useSyncExternalStore(subscribe, read, read);
  const setPrefs = useCallback((patch: Partial<Prefs>, opts: { mirror?: boolean } = {}) => {
    write({ ...read(), ...patch }, opts.mirror ?? true);
  }, []);
  return { prefs, setPrefs };
}
