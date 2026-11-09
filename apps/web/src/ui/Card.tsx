import type { ElementType, HTMLAttributes } from 'react';
import { cx } from './cx';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Render as section, article, li… Defaults to div. */
  as?: ElementType;
  /** Accent edge: "this one is yours" or the current selection. */
  selected?: boolean;
  flush?: boolean;
}

export function Card({ as: Tag = 'div', selected, flush, className, ...rest }: CardProps) {
  return (
    <Tag
      className={cx(
        'ly-card',
        selected && 'ly-card--selected',
        flush && 'ly-card--flush',
        className,
      )}
      {...rest}
    />
  );
}
