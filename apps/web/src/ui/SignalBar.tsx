import type { IconName } from './Icon';
import { Icon } from './Icon';
import { cx } from './cx';

/** The attendee signals. Values match SignalType in @lanyard/contracts. */
export type AttendeeSignal = 'slower' | 'louder' | 'cant_see' | 'lost' | 'thumbs_up';

export const SIGNALS: ReadonlyArray<{ type: AttendeeSignal; label: string; icon: IconName }> = [
  { type: 'slower', label: 'Slower', icon: 'slower' },
  { type: 'louder', label: 'Louder', icon: 'louder' },
  { type: 'cant_see', label: "Can't see", icon: 'cant_see' },
  { type: 'lost', label: 'Lost me', icon: 'lost' },
  { type: 'thumbs_up', label: 'Got it', icon: 'thumbs_up' },
];

export interface SignalBarProps {
  onSignal: (type: AttendeeSignal) => void;
  /** Signals sent in the last few seconds: shown pressed with "Sent". */
  sent?: Partial<Record<AttendeeSignal, boolean>>;
  /** row: 5 across (sheet, side panel). grid: 2 columns of big buttons. */
  layout?: 'row' | 'grid';
  label?: string;
}

/** "Tell the speaker". Confirm each send with a toast: "Sent anonymously". */
export function SignalBar({
  onSignal,
  sent = {},
  layout = 'row',
  label = 'Tell the speaker',
}: SignalBarProps) {
  return (
    <div
      className={cx('ly-signals', layout === 'grid' && 'ly-signals--grid')}
      role="group"
      aria-label={label}
    >
      {SIGNALS.map((s) => {
        const isSent = !!sent[s.type];
        return (
          <button
            key={s.type}
            type="button"
            className="ly-signal"
            aria-pressed={isSent}
            aria-label={isSent ? `${s.label}, sent` : s.label}
            onClick={() => onSignal(s.type)}
          >
            <Icon name={s.icon} />
            <span aria-hidden="true">{isSent ? 'Sent' : s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
