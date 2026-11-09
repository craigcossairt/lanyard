// Root attributes the design system keys off: data-theme, data-caption-size,
// data-readable, data-motion on <html>. Prefs persist in localStorage; WS3/WS6 call
// setRootPrefs() from their settings UI (and PUT /me/prefs to sync).
import type { AccessibilityPrefs } from '@lanyard/contracts';

const KEY = 'lanyard.prefs';

export function loadPrefs(): AccessibilityPrefs {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as AccessibilityPrefs;
  } catch {
    return {};
  }
}

export function applyRootPrefs(p: AccessibilityPrefs = loadPrefs()): void {
  const html = document.documentElement;
  const systemReduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  html.dataset.theme = p.theme ?? 'dark';
  html.dataset.captionSize = p.captionSize ?? 'm';
  if (p.readable) html.dataset.readable = 'true';
  else delete html.dataset.readable;
  if (p.reduceMotion ?? systemReduce) html.dataset.motion = 'reduce';
  else delete html.dataset.motion;
}

export function setRootPrefs(patch: AccessibilityPrefs): AccessibilityPrefs {
  const next = { ...loadPrefs(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  applyRootPrefs(next);
  return next;
}
