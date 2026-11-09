// Inline stroke icons (24x24, currentColor). No icon font, no network.
// Icons are decorative: the visible text or aria-label beside them carries the meaning.

const PATHS = {
  slower: 'M12 14l-4-4|M3.3 17A9 9 0 1 1 20.7 17',
  louder: 'M11 5 6 9H2v6h4l5 4V5z|M15.5 8.5a5 5 0 0 1 0 7|M19 5a10 10 0 0 1 0 14',
  cant_see:
    'm3 3 18 18|M10.6 10.6a2 2 0 0 0 2.8 2.8|M9.9 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4|M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.7 9.7 0 0 0 5.4-1.6',
  lost: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20|M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3|M12 17h.01',
  thumbs_up:
    'M7 10v12|M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z',
  ask: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  catchup: 'M3 12a9 9 0 1 0 3-6.7L3 8|M3 3v5h5|M12 7v5l4 2',
  up: 'M12 19V5|m5 12 7-7 7 7',
  down: 'M12 5v14|m19 12-7 7-7-7',
  close: 'M18 6 6 18|m6 6 12 12',
  people:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8|M22 21v-2a4 4 0 0 0-3-3.9|M16 3.1a4 4 0 0 1 0 7.8',
  list: 'M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01',
  offline:
    'm2 2 20 20|M8.5 16.5a5 5 0 0 1 7 0|M2 8.8a15 15 0 0 1 4.2-2.7|M10.7 5.1a15 15 0 0 1 11.3 3.7|M5 12.9a10 10 0 0 1 5.2-2.8|M12 20h.01',
  display: 'M3 18 8 6l5 12|M4.5 14h7|M15 18v-4.5a2.5 2.5 0 0 1 5 0V18|M15 15.5h5',
  check: 'M20 6 9 17l-5-5',
  warn: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z|M12 9v4|M12 17h.01',
  crit: 'M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z|M15 9l-6 6|m9 9 6 6',
  info: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20|M12 16v-4|M12 8h.01',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z|M19 10v2a7 7 0 0 1-14 0v-2|M12 19v3',
  route:
    'M6 19a2 2 0 1 0 0-4a2 2 0 1 0 0 4|M18 9a2 2 0 1 0 0-4a2 2 0 1 0 0 4|M8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  search: 'M11 3a8 8 0 1 0 0 16a8 8 0 1 0 0-16|m21 21-4.3-4.3',
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps {
  name: IconName;
  className?: string;
}

export function Icon({ name, className }: IconProps) {
  return (
    <svg
      className={className ? `ly-icon ${className}` : 'ly-icon'}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].split('|').map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
