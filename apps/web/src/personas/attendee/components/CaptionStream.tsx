import { useEffect, useRef, useState } from 'react';
import type { CaptionLine } from '../lib/live';

interface Props {
  lines: CaptionLine[];
  /** 'waiting' before the first caption, 'stale' while reconnecting. */
  status: 'live' | 'waiting' | 'stale';
}

const NEAR_BOTTOM_PX = 48;

/**
 * Large auto-following captions. Scrolling up pauses following (so you can re-read)
 * and shows a "Jump to live" button. The live region is polite and never takes focus.
 */
export function CaptionStream({ lines, status }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [missed, setMissed] = useState(0);
  const lastSeen = useRef(lines.length);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (following) {
      el.scrollTop = el.scrollHeight;
      lastSeen.current = lines.length;
      setMissed(0);
    } else {
      setMissed(Math.max(0, lines.length - lastSeen.current));
    }
  }, [lines, following]);

  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (atBottom !== following) setFollowing(atBottom);
  };

  const jump = () => {
    setFollowing(true);
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const latest = lines[lines.length - 1];

  return (
    <section className="at-captions" aria-labelledby="captions-h">
      <h2 id="captions-h" className="at-sr-only">
        Live captions
      </h2>
      <div
        ref={box}
        className={`at-captions__box${status === 'stale' ? ' at-captions__box--stale' : ''}`}
        onScroll={onScroll}
        tabIndex={0}
        aria-label="Caption history, scroll up to re-read"
      >
        {lines.length === 0 ? (
          <p className="at-captions__empty">
            {status === 'waiting'
              ? 'Captions start when the speaker does.'
              : 'Reconnecting… captions paused.'}
          </p>
        ) : (
          lines.map((l, i) => (
            <p
              key={l.chunkId}
              className={
                i === lines.length - 1
                  ? 'at-captions__line at-captions__line--latest'
                  : 'at-captions__line'
              }
            >
              {l.text}
            </p>
          ))
        )}
      </div>
      {/* Screen readers hear only the newest line, politely. */}
      <div className="at-sr-only" aria-live="polite" aria-atomic="true">
        {latest?.text ?? ''}
      </div>
      {!following && (
        <button type="button" className="at-btn at-btn--sm at-captions__jump" onClick={jump}>
          ↓ Jump to live{missed > 0 ? ` (${missed} new)` : ''}
        </button>
      )}
      {status === 'stale' && lines.length > 0 && (
        <p className="at-captions__stale" role="status">
          Reconnecting… captions may be behind.
        </p>
      )}
    </section>
  );
}
