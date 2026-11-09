// Shared brand bits for the shell's own pages (landing, join, QR).
import { EVENT_IDS } from '@lanyard/contracts';

export const EVENT_NAMES: Record<string, string> = {
  [EVENT_IDS.cnhDemos]: 'CNH Demos',
  [EVENT_IDS.kubecon]: 'KubeCon + CloudNativeCon NA 2026',
};

/** The join URL a QR code or poster points at. */
export const joinUrl = (eventId: string): string =>
  `${window.location.origin}/join?event=${encodeURIComponent(eventId)}`;

/** Lanyard wordmark: a badge on a strap, then the name. The text is the accessible name. */
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={`wordmark wordmark--${size}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 2l5 7 5-7" />
        <rect x="5" y="9" width="14" height="13" rx="2.5" />
        <path d="M9 15h6M10 18h4" />
      </svg>
      Lanyard
    </span>
  );
}
