import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { cx } from './cx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary: the one main action on a screen. ghost: toolbar actions. danger: destructive. */
  variant?: 'secondary' | 'primary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  icon?: IconName;
  /** Icon above a small label, for docks and bottom bars. */
  stacked?: boolean;
  block?: boolean;
  /** Small count shown on the corner, e.g. number of questions. Hidden from AT: put it in the label. */
  badge?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  stacked,
  block,
  badge,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'ly-btn',
        variant !== 'secondary' && `ly-btn--${variant}`,
        size === 'lg' && 'ly-btn--lg',
        stacked && 'ly-btn--stacked',
        block && 'ly-btn--block',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
      {badge !== undefined && badge !== null && badge !== '' && (
        <span className="ly-btn__badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Required: the accessible name, since there is no visible text. */
  label: string;
  variant?: 'secondary' | 'primary' | 'ghost';
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'ly-btn',
        'ly-btn--icon',
        variant !== 'secondary' && `ly-btn--${variant}`,
        className,
      )}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
