// WS11: register WS6's caption translator hook and warm translations from the API cache.
import { useEffect, useRef, useState } from 'react';
import type { TranslatedCaptionLine } from '@lanyard/contracts';
import { readCaptionLanguage, setCaptionTranslator } from '../../../i18n/locale';
import { api } from '../lib/api';
import type { CaptionLine } from '../lib/live';

const DEBOUNCE_MS = 300;
const TARGET = 'es';

const byChunk = new Map<string, string>();

function langBase(raw: string): string {
  return raw.toLowerCase().split('-')[0] ?? '';
}

/** Hooks WS6 `translateCaption` to `GET /sessions/:id/captions/translated?lang=es`. */
export function useCaptionTranslation(sessionId: string, captions: CaptionLine[]): void {
  const textToChunk = useRef(new Map<string, string>());
  const since = useRef(0);
  const [, refresh] = useState(0);

  useEffect(() => {
    textToChunk.current.clear();
    for (const line of captions) textToChunk.current.set(line.text, line.chunkId);

    setCaptionTranslator(({ text, from, to }) => {
      if (langBase(to) !== TARGET) return text;
      if (langBase(from) === langBase(to)) return text;
      const chunkId = textToChunk.current.get(text);
      if (!chunkId) return text;
      return byChunk.get(chunkId) ?? text;
    });
    return () => {
      setCaptionTranslator(null);
      byChunk.clear();
    };
  }, [sessionId, captions]);

  const latestChunk = captions[captions.length - 1];
  const latestKey = latestChunk ? `${latestChunk.chunkId}:${latestChunk.seq}` : '';

  useEffect(() => {
    if (langBase(readCaptionLanguage()) !== TARGET) return;
    if (!latestChunk) return;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const q = new URLSearchParams({ lang: TARGET, since: String(since.current) });
          const lines = await api.get<TranslatedCaptionLine[]>(
            `/sessions/${sessionId}/captions/translated?${q}`,
          );
          let updated = false;
          for (const line of lines) {
            if (line.lang === TARGET && line.text.trim()) {
              byChunk.set(line.chunkId, line.text);
              since.current = Math.max(since.current, line.seq);
              updated = true;
            }
          }
          if (updated) refresh((n) => n + 1);
        } catch {
          // translateCaption keeps the speaker language until a later fetch succeeds.
        }
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [sessionId, latestKey, latestChunk]);
}
