import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { EmptyState } from './States';
import { cx } from './cx';

export interface CaptionLine {
  /** Stable key, e.g. the TranscriptChunk seq. */
  id: string | number;
  text: string;
  /** Set when the speaker changes; shown as a small label above the line. */
  speaker?: string;
}

export interface CaptionStreamProps {
  lines: CaptionLine[];
  /** The speaker's words not yet final. Shown dimmed, hidden from screen readers. */
  interim?: string;
  /**
   * live: normal. loading: skeleton lines. waiting: not started yet (shows `waiting`).
   * stale: connection lost; lines dim and the parent shows a Banner.
   */
  status?: 'live' | 'loading' | 'waiting' | 'stale';
  waiting?: { title: ReactNode; body?: ReactNode };
  /** stage: projector size for the speaker console. wide: 42ch lines on a laptop. */
  size?: 'default' | 'wide' | 'stage';
  label?: string;
  className?: string;
}

const NEAR_END_PX = 48;

/**
 * The caption reader. Owns its own scrolling:
 * - follows new lines while you're at the end;
 * - scroll up to re-read and it stops following, with a "Jump to live" button;
 * - finals are a role="log" polite live region, so screen readers hear new lines
 *   without focus moving; interim text is aria-hidden so it isn't read twice.
 */
export function CaptionStream({
  lines,
  interim,
  status = 'live',
  waiting,
  size = 'default',
  label = 'Live captions',
  className,
}: CaptionStreamProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);
  useEffect(() => {
    followingRef.current = following;
  }, [following]);

  const toEnd = useCallback((smooth: boolean) => {
    const el = scroller.current;
    if (!el) return;
    const reduce =
      document.documentElement.dataset.motion === 'reduce' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }, []);

  useLayoutEffect(() => {
    if (following) toEnd(false);
  }, [lines, interim, following, toEnd]);

  // Content also grows without new lines: the font loads, caption size or spacing changes,
  // the screen rotates. Stay pinned to the end while following.
  useEffect(() => {
    const el = content.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (followingRef.current) toEnd(false);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [toEnd]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_END_PX;
    if (atEnd !== following) setFollowing(atEnd);
  }

  return (
    <div
      ref={scroller}
      className={cx(
        'ly-caps',
        size === 'stage' && 'ly-caps--stage',
        size === 'wide' && 'ly-caps--wide',
        status === 'stale' && 'ly-caps--stale',
        className,
      )}
      onScroll={onScroll}
      tabIndex={0}
      aria-label={`${label}, scrollable`}
      role="region"
    >
      <div ref={content}>
        {status === 'loading' ? (
          <div aria-busy="true">
            <span className="ly-sr-only">Loading captions</span>
            {[90, 75, 95, 60].map((w) => (
              <span key={w} className="ly-skeleton" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : status === 'waiting' ? (
          <EmptyState title={waiting?.title ?? 'Captions start when the speaker does'}>
            {waiting?.body ?? 'Keep this open; text appears here automatically.'}
          </EmptyState>
        ) : (
          <>
            <ol className="ly-caps__log" role="log" aria-live="polite" aria-label={label}>
              {lines.map((l) => (
                <li key={l.id} className="ly-caps__line">
                  {l.speaker && <span className="ly-caps__speaker">{l.speaker}</span>}
                  {l.text}
                </li>
              ))}
            </ol>
            {interim && status === 'live' && (
              <p className="ly-caps__interim" aria-hidden="true">
                {interim}…
              </p>
            )}
            {!following && (
              <Button
                variant="primary"
                icon="down"
                className="ly-caps__jump"
                onClick={() => {
                  setFollowing(true);
                  toEnd(true);
                }}
              >
                Jump to live
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
