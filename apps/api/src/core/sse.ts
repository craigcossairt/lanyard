// SSE helper for module routes. The client reads it with fetch + Authorization header
// (no EventSource, no tokens in URLs). Every authenticated stream also carries the
// caller's `user:<anonId>` channel, multiplexed into the same connection.
//
//   app.get('/sessions/:id/stream', { preHandler: requireAuth() }, (req, reply) =>
//     openSse(req, reply, { channels: [channels.session(req.params.id)] }));
//
// The platform gateway cuts every response at 15 s, so streams are short-lived by design:
// - each message carries an `id:`; the server ends the response cleanly at MAX_STREAM_MS
//   with `event: reconnect` + `retry: 0`, and the client reconnects at once;
// - a reconnect sends `Last-Event-ID`; missed messages are replayed from the bus's ~60 s
//   buffer and `ready` says `resumed: true`, so no snapshot is needed (conn.resumed).
import type { FastifyReply, FastifyRequest } from 'fastify';
import { metrics } from '@opentelemetry/api';
import {
  channelKind,
  channels as ch,
  METRICS,
  type Channel,
  type RealtimeMessage,
  type SseReady,
} from '@lanyard/contracts';
import { compareIds, isEventId } from './bus';
import { getBus } from './context';

/** Comment-line heartbeat; cheap, and keeps idle proxies from closing the stream early. */
export const HEARTBEAT_MS = 5_000;
/** End each response before the gateway's fixed 15 s cut, so the end is always clean. */
export const MAX_STREAM_MS = Number(process.env.SSE_MAX_STREAM_MS) || 12_000;
/** Reconnect hint for errors (ms); clean rotations reconnect immediately. */
const RETRY_MS = 2_000;
const READY_TIMEOUT_MS = 2_000;
const MAX_BUFFERED_BYTES = 512 * 1024;

const clientsGauge = metrics.getMeter('lanyard').createUpDownCounter(METRICS.sseClients);

export interface SseOptions {
  /** Channels to subscribe to, besides the caller's user channel. */
  channels: Channel[];
  /** Optional filter, e.g. strip question text off non-session channels. */
  filter?: (msg: RealtimeMessage, channel: Channel, id?: string) => RealtimeMessage | undefined;
  /** Override MAX_STREAM_MS (tests). */
  maxStreamMs?: number;
}

export interface SseConnection {
  send(event: string, data: unknown, id?: string): void;
  close(): void;
  /**
   * Resolves once the stream is live: true when it resumed from Last-Event-ID (missed
   * messages were replayed, so the route should skip its full snapshot), false otherwise.
   */
  resumed: Promise<boolean>;
}

export function openSse(req: FastifyRequest, reply: FastifyReply, opts: SseOptions): SseConnection {
  const subs = [...opts.channels];
  if (req.auth) subs.push(ch.user(req.auth.sub));
  const kind = channelKind(opts.channels[0] ?? subs[0] ?? 'user:none');
  const header = req.headers['last-event-id'];
  const lastId = typeof header === 'string' && isEventId(header) ? header : undefined;

  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  // Small frames must go out immediately: no Nagle delay on the socket.
  res.socket?.setNoDelay(true);
  res.write(`retry: ${RETRY_MS}\n\n`);

  let closed = false;
  // Backpressure: a client that stops reading gets dropped once its buffer passes the
  // cap; it reconnects with Last-Event-ID, so nothing is silently lost.
  const write = (chunk: string) => {
    if (closed) return;
    if (res.writableLength > MAX_BUFFERED_BYTES) {
      close();
      res.destroy(); // don't wait behind a full buffer
      return;
    }
    res.write(chunk);
  };
  const send = (event: string, data: unknown, id?: string) =>
    write(`${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const deliver = (msg: RealtimeMessage, channel: Channel, id?: string) => {
    const out = opts.filter ? opts.filter(msg, channel, id) : msg;
    if (out) send(out.type, out, id);
  };

  // While replaying, park live messages; flush them after the replay, minus duplicates.
  let replaying = Boolean(lastId);
  const parked: { msg: RealtimeMessage; channel: Channel; id?: string }[] = [];
  const bus = getBus();
  const unsubs = subs.map((channel) =>
    bus.subscribe(channel, (msg, c, id) =>
      replaying ? parked.push({ msg, channel: c, id }) : deliver(msg, c, id),
    ),
  );
  const heartbeat = setInterval(() => write(`: hb ${Date.now()}\n\n`), HEARTBEAT_MS);
  const rotate = setTimeout(() => {
    write(`event: reconnect\ndata: {"reason":"max-stream"}\nretry: 0\n\n`);
    close();
  }, opts.maxStreamMs ?? MAX_STREAM_MS);
  clientsGauge.add(1, { channel_kind: kind });

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(rotate);
    clearTimeout(readyTimer);
    unsubs.forEach((u) => u());
    clientsGauge.add(-1, { channel_kind: kind });
    res.end();
  }
  req.raw.on('close', close);

  // `ready {live:true}` means every channel's SUBSCRIBE has landed. `resumed` says whether
  // the Last-Event-ID replay covered the gap (client keeps its state) or the client must
  // refetch its snapshot. If subscribing takes > 2 s, `ready {live:false}` goes first.
  const ready = (live: boolean, resumed: boolean) =>
    send('ready', {
      channels: subs.map(channelKind),
      retryMs: RETRY_MS,
      live,
      resumed,
    } satisfies SseReady);
  let readyTimer: NodeJS.Timeout | undefined = setTimeout(() => {
    readyTimer = undefined;
    ready(false, false);
  }, READY_TIMEOUT_MS);

  const resumed = Promise.all(unsubs.map((u) => u.ready)).then(async () => {
    clearTimeout(readyTimer);
    let ok = false;
    if (lastId) {
      const results = await Promise.all(
        subs.map((c) => bus.replay(c, lastId).then((r) => ({ c, r }))),
      );
      ok = results.every((x) => x.r.complete);
      const sent = new Set<string>();
      if (ok) {
        results
          .flatMap(({ c, r }) => r.entries.map((e) => ({ ...e, c })))
          .sort((a, b) => compareIds(a.id, b.id))
          .forEach((e) => {
            sent.add(e.id);
            deliver(e.msg, e.c, e.id);
          });
      }
      replaying = false;
      for (const p of parked.splice(0))
        if (!p.id || !sent.has(p.id)) deliver(p.msg, p.channel, p.id);
    }
    ready(true, ok);
    return ok;
  });
  return { send, close, resumed };
}
