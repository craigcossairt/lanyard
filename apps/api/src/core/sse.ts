// SSE helper for module routes. The client reads it with fetch + Authorization header
// (no EventSource, no tokens in URLs). Every authenticated stream also carries the
// caller's `user:<anonId>` channel, multiplexed into the same connection.
//
//   app.get('/sessions/:id/stream', { preHandler: requireAuth() }, (req, reply) =>
//     openSse(req, reply, { channels: [channels.session(req.params.id)] }));
import type { FastifyReply, FastifyRequest } from 'fastify';
import { metrics } from '@opentelemetry/api';
import {
  channelKind,
  channels as ch,
  METRICS,
  type Channel,
  type RealtimeMessage,
} from '@lanyard/contracts';
import { getBus } from './context';

const HEARTBEAT_MS = 15_000;
/** Reconnect hint for clients (ms); they back off exponentially from here. */
const RETRY_MS = 2_000;
const READY_TIMEOUT_MS = 2_000;
const MAX_BUFFERED_BYTES = 512 * 1024;

const clientsGauge = metrics.getMeter('lanyard').createUpDownCounter(METRICS.sseClients);

export interface SseOptions {
  /** Channels to subscribe to, besides the caller's user channel. */
  channels: Channel[];
  /** Optional filter, e.g. strip question text off non-session channels. */
  filter?: (msg: RealtimeMessage, channel: Channel) => RealtimeMessage | undefined;
}

export interface SseConnection {
  send(event: string, data: unknown, id?: string): void;
  close(): void;
}

export function openSse(req: FastifyRequest, reply: FastifyReply, opts: SseOptions): SseConnection {
  const subs = [...opts.channels];
  if (req.auth) subs.push(ch.user(req.auth.sub));
  const kind = channelKind(opts.channels[0] ?? subs[0] ?? 'user:none');

  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(`retry: ${RETRY_MS}\n\n`);

  let closed = false;
  // Backpressure: a client that stops reading gets dropped once its buffer passes the
  // cap; it reconnects and refetches its snapshot, so nothing is silently lost.
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

  const bus = getBus();
  const unsubs = subs.map((channel) =>
    bus.subscribe(channel, (msg) => {
      const out = opts.filter ? opts.filter(msg, channel) : msg;
      if (out) send(out.type, out);
    }),
  );
  const heartbeat = setInterval(() => write(`: hb ${Date.now()}\n\n`), HEARTBEAT_MS);
  clientsGauge.add(1, { channel_kind: kind });

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(readyTimer);
    unsubs.forEach((u) => u());
    clientsGauge.add(-1, { channel_kind: kind });
    res.end();
  }
  req.raw.on('close', close);

  // `ready` tells the client when to (re)fetch its snapshot. `live: true` means every
  // channel's SUBSCRIBE has landed, so nothing published after the snapshot can be missed.
  // If that takes longer than 2 s (Valkey slow or down), send `ready {live:false}` first
  // and `ready {live:true}` once it lands; clients refetch on every live:true.
  const ready = (live: boolean) =>
    send('ready', { channels: subs.map(channelKind), retryMs: RETRY_MS, live });
  let readyTimer: NodeJS.Timeout | undefined = setTimeout(() => {
    readyTimer = undefined;
    ready(false);
  }, READY_TIMEOUT_MS);
  void Promise.all(unsubs.map((u) => u.ready)).then(() => {
    clearTimeout(readyTimer);
    ready(true);
  });
  return { send, close };
}
