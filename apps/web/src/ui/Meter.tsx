import { useId, type ReactNode } from 'react';
import { cx } from './cx';

export interface MeterProps {
  label: ReactNode;
  value: number;
  max?: number;
  /** Visible value text, e.g. "212 / 240". Defaults to a percentage. */
  valueText?: string;
  /**
   * Colour by threshold (fraction of max): below warnAt is ok, from warnAt is warn, from critAt is crit.
   * Omit both for a neutral accent bar. The value text always carries the number, so colour is never alone.
   */
  warnAt?: number;
  critAt?: number;
  size?: 'default' | 'lg';
  className?: string;
}

/** Labelled bar for occupancy, signal intensity, caption lag. */
export function Meter({
  label,
  value,
  max = 100,
  valueText,
  warnAt,
  critAt,
  size = 'default',
  className,
}: MeterProps) {
  const labelId = useId();
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const tone =
    critAt !== undefined && ratio >= critAt
      ? 'crit'
      : warnAt !== undefined && ratio >= warnAt
        ? 'warn'
        : warnAt !== undefined || critAt !== undefined
          ? 'ok'
          : null;
  const text = valueText ?? `${Math.round(ratio * 100)}%`;
  // aria-valuenow must sit inside [min, max]. The words keep the real count ("34 / 30").
  const now = Math.min(max, Math.max(0, value));
  const described = value > max ? `${text}, over capacity` : text;
  return (
    <div
      className={cx(
        'ly-meter',
        tone && `ly-meter--${tone}`,
        size === 'lg' && 'ly-meter--lg',
        className,
      )}
    >
      <div className="ly-meter__head">
        <span id={labelId} className="ly-meter__label">
          {label}
        </span>
        <span className="ly-meter__value">{described}</span>
      </div>
      <div
        className="ly-meter__track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={now}
        aria-valuetext={described}
        aria-labelledby={labelId}
      >
        <div className="ly-meter__fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
