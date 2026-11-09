import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from './cx';

export type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral';

const TONE_ICON: Record<Tone, IconName | null> = {
  ok: 'check',
  warn: 'warn',
  crit: 'crit',
  info: 'info',
  neutral: null,
};

export interface StatusPillProps {
  tone?: Tone;
  /** Overrides the tone's default icon. Pass null for none (only when the text says the status). */
  icon?: IconName | null;
  children: ReactNode;
  className?: string;
}

/** Chip / status pill. Colour is never the only signal: always text, plus an icon by default. */
export function StatusPill({ tone = 'neutral', icon, children, className }: StatusPillProps) {
  const name = icon === undefined ? TONE_ICON[tone] : icon;
  return (
    <span className={cx('ly-pill', tone !== 'neutral' && `ly-pill--${tone}`, className)}>
      {name && <Icon name={name} />}
      {children}
    </span>
  );
}

/** The pulsing LIVE pill. The dot stops pulsing under reduced motion. */
export function LivePill({ children = 'LIVE' }: { children?: ReactNode }) {
  return <span className="ly-pill ly-pill--live">{children}</span>;
}
