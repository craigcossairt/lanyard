// The "Display" sheet body, bound to the one prefs store (lib/prefs.ts → the shell's
// `lanyard.prefs` + PUT /me/prefs) so the live view and /a/settings never disagree.
// Same controls and markup classes as the design system's DisplaySettings.
import { Button } from '../../../ui';
import { usePrefs, type DisplayPrefs } from '../lib/prefs';

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

export function DisplayPrefsPanel() {
  const { prefs, setPrefs } = usePrefs();
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
            Easier-to-read font
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
