// TEMP adapter (WS3): SSE over fetch streaming with the Authorization header. Never
// EventSource (it can't send headers, so the token would end up in the URL). The WS0
// shell's `useSse` replaces this; the signature is kept identical.
import { useEffect, useRef, useState } from 'react';
import type { RealtimeMessage } from '@lanyard/contracts';
import { authHeaders } from './api';
import { isMock, MOCK_CAPTIONS } from './mock';

export type SseStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

interface Options {
  onReconnect?: () => void;
  enabled?: boolean;
}

const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 15_000;

function parseEvents(buffer: string, emit: (type: string, data: string) => void): string {
  // SSE frames end with a blank line. Keep the unfinished tail in the buffer.
  let idx: number;
  while ((idx = buffer.indexOf('\n\n')) >= 0) {
    const frame = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);
    let type = 'message';
    const data: string[] = [];
    for (const raw of frame.split('\n')) {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      if (!line || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') type = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length) emit(type, data.join('\n'));
  }
  return buffer;
}

export function useSse(
  path: string | null,
  onMessage: (msg: RealtimeMessage) => void,
  opts: Options = {},
): SseStatus {
  const [status, setStatus] = useState<SseStatus>('connecting');
  const handler = useRef(onMessage);
  const reconnectCb = useRef(opts.onReconnect);
  handler.current = onMessage;
  reconnectCb.current = opts.onReconnect;
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!path || !enabled) {
      setStatus('closed');
      return;
    }
    if (isMock()) return mockStream(handler, setStatus);

    let stopped = false;
    let attempt = 0;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      if (stopped) return;
      controller = new AbortController();
      setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      try {
        const res = await fetch(`/api${path}`, {
          headers: { accept: 'text/event-stream', ...authHeaders() },
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        if (attempt > 0) reconnectCb.current?.();
        attempt = 0;
        setStatus('open');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = parseEvents(buffer, (type, data) => {
            if (type === 'ready') return;
            try {
              const msg = JSON.parse(data) as RealtimeMessage;
              if (msg && typeof msg === 'object' && 'type' in msg) handler.current(msg);
            } catch {
              // Ignore a malformed frame; the next one is independent.
            }
          });
        }
      } catch {
        // Fall through to the backoff below (network error, abort, or non-2xx).
      }
      if (stopped) return;
      attempt += 1;
      const wait = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** Math.min(attempt, 4));
      setStatus('reconnecting');
      timer = setTimeout(connect, wait + Math.random() * 250);
    };
    void connect();

    return () => {
      stopped = true;
      controller?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [path, enabled]);

  return status;
}

function mockStream(
  handler: React.RefObject<(msg: RealtimeMessage) => void>,
  setStatus: (s: SseStatus) => void,
): () => void {
  setStatus('open');
  let i = 0;
  const captions = setInterval(() => {
    const text = MOCK_CAPTIONS[i % MOCK_CAPTIONS.length] ?? '';
    i += 1;
    handler.current({
      type: 'caption.appended',
      at: new Date().toISOString(),
      payload: { chunkId: `m${i}`, seq: i, text, lang: 'en' },
    });
  }, 2_800);
  const signals = setInterval(() => {
    handler.current({
      type: 'signals.window',
      at: new Date().toISOString(),
      payload: { sessionId: 's-lanyard', windowSec: 60, counts: { slower: 3, thumbs_up: 9 } },
    });
  }, 10_000);
  const reroute = setTimeout(() => {
    handler.current({
      type: 'reroute.suggested',
      at: new Date().toISOString(),
      payload: { anonId: 'me', sessionId: 's-hallway', reason: 'Main Stage is full. Hallway Track: open Q&A has seats on the Side Stage.' },
    });
  }, 25_000);
  return () => {
    clearInterval(captions);
    clearInterval(signals);
    clearTimeout(reroute);
  };
}
