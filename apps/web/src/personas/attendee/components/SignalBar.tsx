import { useRef, useState } from 'react';
import type { SignalType } from '@lanyard/contracts';

export const ATTENDEE_SIGNALS: Array<{ type: SignalType; label: string; icon: string }> = [
  { type: 'slower', label: 'Slower', icon: '🐢' },
  { type: 'louder', label: 'Louder', icon: '🔊' },
  { type: 'cant_see', label: "Can't see slides", icon: '🙈' },
  { type: 'lost', label: 'Lost me', icon: '🧭' },
  { type: 'thumbs_up', label: 'Great', icon: '👍' },
];

const COOLDOWN_MS = 30_000;

interface Props {
  onSignal: (type: SignalType) => Promise<void>;
  onSent?: (label: string) => void;
}

/** Five anonymous signals. Each is rate-limited client-side to match the API (1 per type per 30 s). */
export function SignalBar({ onSignal, onSent }: Props) {
  const [sent, setSent] = useState<Partial<Record<SignalType, boolean>>>({});
  const timers = useRef<Partial<Record<SignalType, ReturnType<typeof setTimeout>>>>({});

  const send = async (type: SignalType, label: string) => {
    if (sent[type]) return;
    setSent((s) => ({ ...s, [type]: true }));
    try {
      await onSignal(type);
      onSent?.(label);
    } catch {
      setSent((s) => ({ ...s, [type]: false }));
      return;
    }
    timers.current[type] = setTimeout(() => setSent((s) => ({ ...s, [type]: false })), COOLDOWN_MS);
  };

  return (
    <div className="at-signals" role="group" aria-label="Tell the speaker, anonymously">
      {ATTENDEE_SIGNALS.map((s) => (
        <button
          key={s.type}
          type="button"
          className="at-signal"
          aria-pressed={Boolean(sent[s.type])}
          onClick={() => void send(s.type, s.label)}
        >
          <span className="at-signal__icon" aria-hidden="true">
            {s.icon}
          </span>
          <span className="at-signal__label">{sent[s.type] ? 'Sent' : s.label}</span>
        </button>
      ))}
    </div>
  );
}
