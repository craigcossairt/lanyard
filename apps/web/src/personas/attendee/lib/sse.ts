// Session stream reader for the live views. Thin wrapper over the shell's `useSse`, which
// now passes WS2's `snapshot` frame through (onEvent) and survives the gateway's 15 s cut:
// the server rotates streams at ~12 s, and the shell reconnects at once with Last-Event-ID
// and gets the missed delta replayed (no snapshot refetch, no visible gap).
// Same exported signature as before, so callers are unchanged.
// (WS0 ownership exception for the SSE P0 fix, approved by the orchestrator.)
import type { RealtimeMessage } from '@lanyard/contracts';
import { useSse as useShellSse, type SseStatus } from '../../../app/sse';

export type { SseStatus };

/** Everything the stream delivers: contract messages plus the module's `snapshot` event. */
export type StreamEvent = RealtimeMessage | { type: 'snapshot'; at: string; payload: unknown };

interface Options {
  onReconnect?: () => void;
  enabled?: boolean;
}

export function useSse(
  path: string | null,
  onMessage: (msg: StreamEvent) => void,
  opts: Options = {},
): SseStatus {
  return useShellSse(path ?? undefined, onMessage, {
    ...opts,
    onEvent: (event, data) => {
      if (event === 'snapshot' && data && typeof data === 'object' && 'type' in data) {
        onMessage(data as StreamEvent);
      }
    },
  });
}
