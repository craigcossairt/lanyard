// SSE over fetch: the token goes in the Authorization header, never in the URL, so we
// parse the stream ourselves instead of using EventSource.
//   useSse(`/sessions/${id}/stream`, (msg) => dispatch(msg), { onReconnect: refetchSnapshot });
import { useEffect, useRef, useState } from 'react';
import { RealtimeMessage } from '@lanyard/contracts';
import { authHeaders } from './api';

export type SseStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface SseOptions {
  /** Called after every successful REconnect: refetch your snapshot here. */
  onReconnect?: () => void;
  enabled?: boolean;
}

const MAX_BACKOFF_MS = 30_000;

/** Parse complete SSE frames out of `buf`; returns the unconsumed remainder. */
export function parseSse(buf: string, onEvent: (event: string, data: string) => void): string {
  const frames = buf.split(/\r?\n\r?\n/);
  const rest = frames.pop() ?? '';
  for (const frame of frames) {
    let event = 'message';
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith(':')) continue; // heartbeat comment
      const i = line.indexOf(':');
      const field = i < 0 ? line : line.slice(0, i);
      const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length) onEvent(event, data.join('\n'));
  }
  return rest;
}

export function useSse(
  path: string | undefined,
  onMessage: (msg: RealtimeMessage) => void,
  opts: SseOptions = {},
): SseStatus {
  const [status, setStatus] = useState<SseStatus>('connecting');
  const handler = useRef(onMessage);
  const reconnect = useRef(opts.onReconnect);
  handler.current = onMessage;
  reconnect.current = opts.onReconnect;
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!path || !enabled) return;
    const ac = new AbortController();
    let attempt = 0;
    let retryMs = 2_000;
    let everOpen = false;

    const run = async () => {
      while (!ac.signal.aborted) {
        try {
          setStatus(everOpen ? 'reconnecting' : 'connecting');
          const res = await fetch(`/api${path}`, {
            headers: { ...authHeaders(), accept: 'text/event-stream' },
            signal: ac.signal,
            cache: 'no-store',
          });
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
          setStatus('open');
          if (everOpen) reconnect.current?.();
          everOpen = true;
          attempt = 0;
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf = parseSse(buf + dec.decode(value, { stream: true }), (event, data) => {
              if (event === 'ready') {
                const hint = (JSON.parse(data) as { retryMs?: number }).retryMs;
                if (hint) retryMs = hint;
                return;
              }
              const msg = RealtimeMessage.safeParse(JSON.parse(data));
              if (msg.success) handler.current(msg.data);
            });
          }
        } catch {
          if (ac.signal.aborted) break;
        }
        // Exponential backoff with jitter, starting from the server's retry hint.
        const delay =
          Math.min(retryMs * 2 ** attempt, MAX_BACKOFF_MS) * (0.75 + Math.random() * 0.5);
        attempt++;
        setStatus('reconnecting');
        await new Promise((r) => setTimeout(r, delay));
      }
    };
    void run();
    return () => {
      ac.abort();
      setStatus('closed');
    };
  }, [path, enabled]);

  return status;
}
