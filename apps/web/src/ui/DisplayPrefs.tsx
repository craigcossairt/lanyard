import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from './Button';

/** Matches AccessibilityPrefs in @lanyard/contracts (the display subset). */
export interface DisplayPrefs {
  theme: 'dark' | 'light' | 'contrast';
  captionSize: 's' | 'm' | 'l' | 'xl' | 'xxl';
  readable: boolean;
  reduceMotion: boolean;
}

const KEY = 'lanyard.display';

function initial(): DisplayPrefs {
  const media = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches;
  const defaults: DisplayPrefs = {
    // Dark first. Start in high contrast if the OS asks for more contrast.
    theme: media('(prefers-contrast: more)') ? 'contrast' : 'dark',
    captionSize: 'l',
    readable: false,
    reduceMotion: media('(prefers-reduced-motion: reduce)'),
  };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<DisplayPrefs> | null;
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

interface Ctx {
  prefs: DisplayPrefs;
  setPrefs: (patch: Partial<DisplayPrefs>) => void;
}

const DisplayContext = createContext<Ctx | null>(null);

/**
 * Wrap the app once. Applies the prefs to <html> as data attributes (tokens.css reads them)
 * and saves them in localStorage. Persona code can also sync them to the server.
 */
export function DisplayPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, set] = useState<DisplayPrefs>(initial);

  useEffect(() => {
    const d = document.documentElement.dataset;
    d.theme = prefs.theme;
    d.captionSize = prefs.captionSize;
    d.readable = String(prefs.readable);
    d.motion = prefs.reduceMotion ? 'reduce' : 'full';
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Private mode: prefs still apply for this visit.
    }
  }, [prefs]);

  const value = useMemo<Ctx>(
    () => ({ prefs, setPrefs: (patch) => set((p) => ({ ...p, ...patch })) }),
    [prefs],
  );
  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export function useDisplayPrefs(): Ctx {
  const ctx = useContext(DisplayContext);
  if (!ctx) throw new Error('useDisplayPrefs needs <DisplayPrefsProvider> above it');
  return ctx;
}

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

/** The "Display" sheet body: caption size, colours, readable spacing, reduce motion. Changes apply instantly. */
export function DisplaySettings() {
  const { prefs, setPrefs } = useDisplayPrefs();
  return (
    <div className="ly-prefs">
      <fieldset>
        <legend>Caption size</legend>
        <div className="ly-prefs__row">
          {SIZES.map(([v, l]) => (
            <Button
              key={v}
              aria-pressed={prefs.captionSize === v}
              aria-label={`Caption size ${l}`}
              onClick={() => setPrefs({ captionSize: v })}
            >
              {l}
            </Button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Colours</legend>
        <div className="ly-prefs__row">
          {THEMES.map(([v, l]) => (
            <Button key={v} aria-pressed={prefs.theme === v} onClick={() => setPrefs({ theme: v })}>
              {l}
            </Button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Reading</legend>
        <div className="ly-prefs__row">
          <Button
            aria-pressed={prefs.readable}
            onClick={() => setPrefs({ readable: !prefs.readable })}
          >
            Readable spacing
          </Button>
          <Button
            aria-pressed={prefs.reduceMotion}
            onClick={() => setPrefs({ reduceMotion: !prefs.reduceMotion })}
          >
            Reduce motion
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
