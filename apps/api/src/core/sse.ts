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
  const send = (event: string, data: unknown, id?: string) => {
    if (closed) return;
    res.write(`${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const bus = getBus();
  const unsubs = subs.map((channel) =>
    bus.subscribe(channel, (msg) => {
      const out = opts.filter ? opts.filter(msg, channel) : msg;
      if (out) send(out.type, out);
    }),
  );
  const heartbeat = setInterval(() => !closed && res.write(`: hb ${Date.now()}\n\n`), HEARTBEAT_MS);
  clientsGauge.add(1, { channel_kind: kind });

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubs.forEach((u) => u());
    clientsGauge.add(-1, { channel_kind: kind });
    res.end();
  };
  req.raw.on('close', close);

  send('ready', { channels: subs.map(channelKind), retryMs: RETRY_MS });
  return { send, close };
}
