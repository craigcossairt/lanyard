// Live captions from the browser's speech recognition (Chrome/Edge). Interim results are
// shown locally only; each final utterance is posted to POST /sessions/:id/transcript
// with the utterance's start and end timestamps. No audio ever leaves the browser
// through us, and caption text is never logged.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranscriptRequest } from '@lanyard/contracts';
import { api } from '../../attendee/lib/api';

export type CaptionState = 'idle' | 'starting' | 'listening' | 'unsupported' | 'blocked' | 'error';

export interface CaptionsApi {
  supported: boolean;
  state: CaptionState;
  /** Words recognised so far in the current utterance (not yet sent). */
  interim: string;
  /** Last few finals we sent, newest last, with stable ids (a running sequence). */
  recent: Array<{ id: string; text: string }>;
  sentCount: number;
  error: string | null;
  start: () => void;
  stop: () => void;
  /** Typed live notes: same pipeline, source "typed". */
  postTyped: (text: string) => Promise<void>;
}

const RECENT = 6;

function recognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function useSpeechCaptions(sessionId: string, lang = 'en-US'): CaptionsApi {
  const Ctor = recognitionCtor();
  const supported = Boolean(Ctor);
  const [state, setState] = useState<CaptionState>(supported ? 'idle' : 'unsupported');
  const [interim, setInterim] = useState('');
  const [recent, setRecent] = useState<Array<{ id: string; text: string }>>([]);
  const [sentCount, setSentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const wantListening = useRef(false);
  const utteranceStart = useRef<string | null>(null);
  const seq = useRef(0);

  const post = useCallback(
    async (text: string, source: 'speech' | 'typed', startedAt?: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const endedAt = new Date().toISOString();
      seq.current += 1;
      const id = `c${seq.current}`;
      const body: TranscriptRequest = {
        text: trimmed,
        startedAt: startedAt ?? endedAt,
        endedAt,
        lang: lang.split('-')[0] ?? 'en',
        source,
      };
      await api.post(`/sessions/${encodeURIComponent(sessionId)}/transcript`, body);
      setSentCount((n) => n + 1);
      setRecent((r) => [...r, { id, text: trimmed }].slice(-RECENT));
    },
    [sessionId, lang],
  );

  const stop = useCallback(() => {
    wantListening.current = false;
    rec.current?.stop();
    rec.current = null;
    setInterim('');
    setState((s) => (s === 'unsupported' ? s : 'idle'));
  }, []);

  const start = useCallback(() => {
    if (!Ctor) return;
    wantListening.current = true;
    setError(null);
    setState('starting');
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => setState('listening');
    r.onspeechstart = () => {
      if (!utteranceStart.current) utteranceStart.current = new Date().toISOString();
    };
    r.onresult = (ev) => {
      let interimText = '';
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const res = ev.results[i];
        const alt = res?.[0];
        if (!res || !alt) continue;
        if (res.isFinal) {
          const startedAt = utteranceStart.current ?? undefined;
          utteranceStart.current = null;
          void post(alt.transcript, 'speech', startedAt).catch(() => {
            setError('A caption could not be sent. Check the connection; recognition continues.');
          });
        } else {
          interimText += alt.transcript;
          if (!utteranceStart.current) utteranceStart.current = new Date().toISOString();
        }
      }
      setInterim(interimText);
    };
    r.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        wantListening.current = false;
        setState('blocked');
        setError('Microphone access was blocked. Allow the mic for this site, then start again.');
        return;
      }
      if (ev.error === 'no-speech' || ev.error === 'aborted') return; // onend restarts
      setError(`Speech recognition hiccup (${ev.error}). Restarting…`);
    };
    r.onend = () => {
      // Chrome ends recognition after silence or ~60 s. Keep going until Stop is pressed.
      if (wantListening.current && rec.current === r) {
        try {
          r.start();
        } catch {
          setState('error');
          setError('Recognition stopped. Press Start captions to resume.');
        }
      } else if (rec.current === r) {
        // Chrome fires onend after an error too: keep 'blocked' and 'error' visible.
        setState((st) => (st === 'blocked' || st === 'error' ? st : 'idle'));
      }
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      setState('error');
      setError('Could not start speech recognition in this browser.');
    }
  }, [Ctor, lang, post]);

  useEffect(() => () => stop(), [stop]);

  return {
    supported,
    state,
    interim,
    recent,
    sentCount,
    error,
    start,
    stop,
    postTyped: (text) => post(text, 'typed'),
  };
}
