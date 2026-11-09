import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../i18n/useI18n';
import type { CaptionLine } from '../lib/live';
import { groupCaptionLines, presentCaption, speakerLabel, type CaptionChunk } from './captions';

interface Props {
  lines: CaptionLine[];
  /** 'waiting' before the first caption, 'stale' while reconnecting. */
  status: 'live' | 'waiting' | 'stale';
  /** People listed on the session. Shown until a chunk names its own speaker. */
  speakers?: readonly string[];
}

const NEAR_BOTTOM_PX = 48;

/**
 * Large auto-following captions. Scrolling up pauses following (so you can re-read)
 * and shows a "Jump to live" button. The live region is polite and never takes focus.
 */
export function CaptionStream({ lines, status, speakers = [] }: Props) {
  const { t, captionLanguage } = useI18n();
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

  const fallback = speakerLabel(speakers);
  const shown: CaptionChunk[] = lines.map((line) => {
    const presented = presentCaption(line.text, line.lang, captionLanguage);
    return { chunkId: line.chunkId, speaker: line.speaker, ...presented };
  });
  const groups = groupCaptionLines(shown, fallback);
  const latest = shown[shown.length - 1];
  const previous = shown[shown.length - 2];
  const latestSpeaker = latest ? latest.speaker?.trim() || fallback : '';
  const previousSpeaker = previous ? previous.speaker?.trim() || fallback : '';
  const announce =
    latest && latestSpeaker && latestSpeaker !== previousSpeaker
      ? `${latestSpeaker}. ${latest.text}`
      : (latest?.text ?? '');

  return (
    <section className="at-captions" aria-labelledby="captions-h">
      <h2 id="captions-h" className="at-sr-only">
        {t('captions')}
      </h2>
      <div
        ref={box}
        className={`at-captions__box${status === 'stale' ? ' at-captions__box--stale' : ''}`}
        onScroll={onScroll}
        tabIndex={0}
        aria-label={t('captionsHistory')}
      >
        <div className="at-captions__measure">
          {shown.length === 0 ? (
            <p className="at-captions__empty">
              {status === 'waiting' ? t('captionsWaiting') : t('captionsPaused')}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.lines[0]?.chunkId} className="at-captions__group">
                {group.speaker && (
                  <p className="at-captions__speaker">
                    <span className="at-sr-only">{t('speakerChange')}: </span>
                    {group.speaker}
                  </p>
                )}
                {group.lines.map((line) => (
                  <p
                    key={line.chunkId}
                    lang={line.lang}
                    className={
                      line.chunkId === latest?.chunkId
                        ? 'at-captions__line at-captions__line--latest'
                        : 'at-captions__line'
                    }
                  >
                    {line.text}
                  </p>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
      {/* Screen readers hear only the newest line, politely, plus a speaker change. */}
      <div className="at-sr-only" aria-live="polite" aria-atomic="true" lang={latest?.lang}>
        {announce}
      </div>
      {!following && (
        <button type="button" className="at-btn at-btn--sm at-captions__jump" onClick={jump}>
          {missed > 0 ? t('jumpLiveNew', { count: missed }) : t('jumpLive')}
        </button>
      )}
      {status === 'stale' && lines.length > 0 && (
        <p className="at-captions__stale" role="status">
          {t('captionsBehind')}
        </p>
      )}
    </section>
  );
}
