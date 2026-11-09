import { useRef, useState } from 'react';
import type { SignalType } from '@lanyard/contracts';
import type { MessageKey } from '../../../i18n/messages';
import { useI18n } from '../../../i18n/useI18n';

export const ATTENDEE_SIGNALS: Array<{ type: SignalType; label: string; icon: string }> = [
  { type: 'slower', label: 'Slower', icon: '🐢' },
  { type: 'louder', label: 'Louder', icon: '🔊' },
  { type: 'cant_see', label: "Can't see slides", icon: '🙈' },
  { type: 'lost', label: 'Lost me', icon: '🧭' },
  { type: 'thumbs_up', label: 'Great', icon: '👍' },
];

const COOLDOWN_MS = 30_000;

const SIGNAL_KEY: Partial<Record<SignalType, MessageKey>> = {
  slower: 'signalSlower',
  louder: 'signalLouder',
  cant_see: 'signalCantSee',
  lost: 'signalLost',
  thumbs_up: 'signalGreat',
};

interface Props {
  onSignal: (type: SignalType) => Promise<void>;
  onSent?: (label: string) => void;
  onFailed?: (label: string) => void;
}

/** Five anonymous signals. Each is rate-limited client-side to match the API (1 per type per 30 s). */
export function SignalBar({ onSignal, onSent, onFailed }: Props) {
  const { t } = useI18n();
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
      onFailed?.(label);
      return;
    }
    timers.current[type] = setTimeout(() => setSent((s) => ({ ...s, [type]: false })), COOLDOWN_MS);
  };

  return (
    <div className="at-signals" role="group" aria-label={t('tellSpeakerAnon')}>
      {ATTENDEE_SIGNALS.map((s) => {
        const key = SIGNAL_KEY[s.type];
        if (!key) return null;
        const label = t(key);
        return (
          <button
            key={s.type}
            type="button"
            className={`at-signal${sent[s.type] ? ' at-signal--sent' : ''}`}
            disabled={sent[s.type]}
            aria-pressed={sent[s.type]}
            onClick={() => void send(s.type, label)}
          >
            <span aria-hidden="true">{s.icon}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
