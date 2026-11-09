// SSE over fetch: the token goes in the Authorization header, never in the URL, so we
// parse the stream ourselves instead of using EventSource.
//   useSse(`/sessions/${id}/stream`, (msg) => dispatch(msg), {
//     onEvent: (event, data) => event === 'snapshot' && setState(data),
//     onReconnect: refetchSnapshot, // only when the server could not resume
//   });
//
// The platform gateway cuts every response at 15 s, so the server ends each stream at ~12 s
// (`event: reconnect`). We reconnect immediately with Last-Event-ID; the server replays what
// we missed (`ready {resumed:true}`), so the UI never shows a gap and no snapshot is refetched.
import { useEffect, useRef, useState } from 'react';
import { RealtimeMessage } from '@lanyard/contracts';
import { authHeaders } from './api';

export type SseStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface SseOptions {
  /** Called when the server could not resume from Last-Event-ID: refetch your snapshot. */
  onReconnect?: () => void;
  /** Non-realtime frames (`snapshot`, `ready`, `error`, ...) with parsed JSON data. */
  onEvent?: (event: string, data: unknown) => void;
  enabled?: boolean;
}

const MAX_BACKOFF_MS = 30_000;
const SEEN_MAX = 500;
/** A stream that lived this long was healthy: its next unannounced end retries at once. */
const HEALTHY_MS = 5_000;

/** Parse complete SSE frames out of `buf`; returns the unconsumed remainder. */
export function parseSse(
  buf: string,
  onEvent: (event: string, data: string, id?: string) => void,
): string {
  const frames = buf.split(/\r?\n\r?\n/);
  const rest = frames.pop() ?? '';
  for (const frame of frames) {
    let event = 'message';
    let id: string | undefined;
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith(':')) continue; // heartbeat comment
      const i = line.indexOf(':');
      const field = i < 0 ? line : line.slice(0, i);
      const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
      else if (field === 'id') id = value;
    }
    if (data.length) onEvent(event, data.join('\n'), id);
  }
  return rest;
}

/** Backoff before reconnect attempt `attempt` (0 = immediately). */
export function reconnectDelay(attempt: number, retryMs: number): number {
  if (attempt === 0) return 0;
  return Math.min(retryMs * 2 ** (attempt - 1), MAX_BACKOFF_MS) * (0.75 + Math.random() * 0.5);
}

export function useSse(
  path: string | undefined,
  onMessage: (msg: RealtimeMessage) => void,
  opts: SseOptions = {},
): SseStatus {
  const [status, setStatus] = useState<SseStatus>('connecting');
  const handler = useRef(onMessage);
  const reconnect = useRef(opts.onReconnect);
  const other = useRef(opts.onEvent);
  handler.current = onMessage;
  reconnect.current = opts.onReconnect;
  other.current = opts.onEvent;
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!path || !enabled) return;
    const ac = new AbortController();
    let attempt = 0;
    let retryMs = 2_000;
    let everOpen = false;
    let degraded = false; // got ready {live:false}; recover on the following live:true
    let lastId: string | undefined;
    const seen = new Set<string>(); // dedupe replayed messages by id

    const run = async () => {
      while (!ac.signal.aborted) {
        let clean = false; // server announced a rotation (`event: reconnect`)
        let resync = false; // we dropped the stream on purpose to get a fresh snapshot
        const conn = new AbortController();
        const openedAt = Date.now();
        try {
          if (!everOpen) setStatus('connecting');
          const res = await fetch(`/api${path}`, {
            headers: {
              ...authHeaders(),
              accept: 'text/event-stream',
              ...(lastId ? { 'last-event-id': lastId } : {}),
            },
            signal: AbortSignal.any([ac.signal, conn.signal]),
            cache: 'no-store',
          });
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf = parseSse(buf + dec.decode(value, { stream: true }), (event, data, id) => {
              const parsed: unknown = JSON.parse(data);
              if (event === 'reconnect') {
                clean = true;
                return;
              }
              if (event === 'ready') {
                const r = parsed as { retryMs?: number; live?: boolean; resumed?: boolean };
                if (r.retryMs) retryMs = r.retryMs;
                setStatus('open');
                other.current?.(event, parsed);
                if (r.live === false) {
                  degraded = true;
                  return;
                }
                if (degraded) {
                  // Live only now: whatever was published between the server's snapshot and
                  // this point may be missing. Recover via onReconnect, or else reopen the
                  // stream without Last-Event-ID so the server sends a fresh snapshot.
                  degraded = false;
                  if (reconnect.current) reconnect.current();
                  else {
                    lastId = undefined;
                    resync = true;
                    conn.abort();
                    return;
                  }
                } else if (everOpen && !r.resumed) reconnect.current?.();
                everOpen = true;
                return;
              }
              if (id) {
                if (seen.has(id)) return;
                seen.add(id);
                if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value as string);
                lastId = id;
              }
              const msg = RealtimeMessage.safeParse(parsed);
              if (msg.success) handler.current(msg.data);
              else other.current?.(event, parsed);
            });
          }
        } catch {
          if (ac.signal.aborted) break;
        }
        const lived = Date.now() - openedAt;
        // Announced rotation or deliberate resync: reconnect at once, UI stays "open".
        if (resync || (clean && lived > 1_000)) {
          attempt = 0;
          continue;
        }
        // Unannounced end or error. A connection that was healthy for a while (e.g. cut by a
        // proxy) retries immediately; quick repeated failures (even ones that sent `ready`
        // first) keep backing off, so a failing dependency isn't hammered.
        if (lived >= HEALTHY_MS) attempt = 0;
        const delay = reconnectDelay(attempt, retryMs);
        attempt++;
        if (attempt > 1) setStatus('reconnecting');
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
