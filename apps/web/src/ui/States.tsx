import type { CSSProperties, ReactNode } from 'react';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { cx } from './cx';

export interface EmptyStateProps {
  /** Say what will appear and when: "Captions start when Priya does". */
  title: ReactNode;
  children?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}

/** Nothing here yet. Tell people what will show up and whether they need to do anything. */
export function EmptyState({ title, children, icon, action }: EmptyStateProps) {
  return (
    <div className="ly-empty">
      {icon && <Icon name={icon} className="ly-empty__icon" />}
      <strong className="ly-empty__title">{title}</strong>
      {children && <p className="ly-empty__body">{children}</p>}
      {action && <div className="ly-empty__action">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  title?: ReactNode;
  /** What happens next, in plain words: "We'll retry automatically. Your question is saved." */
  children?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}

/** A region that failed to load. For a connection problem across the whole screen, use Banner. */
export function ErrorState({
  title = "Can't load this",
  children,
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  return (
    <div className="ly-empty ly-empty--error" role="status">
      <Icon name="warn" className="ly-empty__icon" />
      <strong className="ly-empty__title">{title}</strong>
      {children && <p className="ly-empty__body">{children}</p>}
      {onRetry && (
        <div className="ly-empty__action">
          <Button onClick={onRetry}>{retryLabel}</Button>
        </div>
      )}
    </div>
  );
}

export interface BannerProps {
  tone?: 'warn' | 'crit' | 'info';
  icon?: IconName;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}

/** Full-width strip under the header: "Reconnecting… captions paused at 10:42 [Retry now]". */
export function Banner({ tone = 'warn', icon, children, action }: BannerProps) {
  const name = icon ?? (tone === 'info' ? 'info' : tone === 'crit' ? 'crit' : 'warn');
  return (
    <div className={cx('ly-banner', tone !== 'warn' && `ly-banner--${tone}`)} role="status">
      <Icon name={name} />
      <span>{children}</span>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}

export interface SkeletonProps {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  className?: string;
}

/**
 * Placeholder block. Decorative: wrap a group in an element with aria-busy="true"
 * and a visually hidden "Loading …" text.
 */
export function Skeleton({ width = '100%', height = '1em', className }: SkeletonProps) {
  return (
    <span className={cx('ly-skeleton', className)} style={{ width, height }} aria-hidden="true" />
  );
}

/** Skeleton list for cards: `count` blocks of `height`, with a hidden label. */
export function SkeletonList({
  count = 3,
  height = 84,
  label = 'Loading',
}: {
  count?: number;
  height?: number;
  label?: string;
}) {
  return (
    <div aria-busy="true" style={{ display: 'grid', gap: 10 }}>
      <span className="ly-sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  );
}
