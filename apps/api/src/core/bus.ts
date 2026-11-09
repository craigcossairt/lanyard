// Typed realtime bus. Valkey pub/sub when VALKEY_URL is set; an in-process bus
// otherwise (single pod / local dev), so nothing hard-fails without Valkey.
//   await bus.publish(channels.session(id), realtime('caption.appended', {...}))
//   const off = bus.subscribe(channels.user(anonId), (msg, channel, id) => ...)
// Every published message gets an id ("<ms>-<seq>", time-ordered) and is kept for
// REPLAY_TTL_MS in a per-channel buffer, so a reconnecting SSE client can resume from
// Last-Event-ID without loss (the platform gateway cuts streams at 15 s).
import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';
import { metrics } from '@opentelemetry/api';
import { channelKind, METRICS, RealtimeMessage, type Channel } from '@lanyard/contracts';
import { logger } from './logger';

export type Handler = (msg: RealtimeMessage, channel: Channel, id?: string) => void;

/** Call it to unsubscribe; `ready` resolves once the channel is live on Valkey. */
export type Subscription = (() => void) & { ready: Promise<void> };

export interface Replay {
  /** Messages after `afterId`, oldest first. */
  entries: { id: string; msg: RealtimeMessage }[];
  /** False when `afterId` is older than the buffer covers: the caller needs a snapshot. */
  complete: boolean;
}

export interface Bus {
  readonly kind: 'valkey' | 'memory';
  publish(channel: Channel, msg: RealtimeMessage): Promise<void>;
  subscribe(channel: Channel, handler: Handler): Subscription;
  replay(channel: Channel, afterId: string): Promise<Replay>;
  close(): Promise<void>;
}

/** How long published messages stay replayable, and the per-channel cap. */
export const REPLAY_TTL_MS = 60_000;
const REPLAY_MAX = 2_000;

const ID_RE = /^(\d+)-(\d+)$/;
export const isEventId = (id: string | undefined): id is string => !!id && ID_RE.test(id);
/** Compare two "<ms>-<seq>" ids. */
export function compareIds(a: string, b: string): number {
  const [, am = '0', as = '0'] = ID_RE.exec(a) ?? [];
  const [, bm = '0', bs = '0'] = ID_RE.exec(b) ?? [];
  return Number(am) - Number(bm) || Number(as) - Number(bs);
}
const idAgeMs = (id: string) => Date.now() - Number(ID_RE.exec(id)?.[1] ?? 0);

const meter = metrics.getMeter('lanyard');
const fanoutMs = meter.createHistogram(METRICS.realtimeFanoutMs, { unit: 'ms' });

function observeFanout(channel: Channel, msg: RealtimeMessage): void {
  const lag = Date.now() - Date.parse(msg.at);
  if (Number.isFinite(lag) && lag >= 0)
    fanoutMs.record(lag, { channel_kind: channelKind(channel) });
}

/** Refcounted local fan-out shared by both implementations. */
class LocalFanout {
  private emitter = new EventEmitter().setMaxListeners(0);
  private ready = new Map<string, Promise<void>>();
  count = (ch: string) => this.emitter.listenerCount(ch);
  on(ch: Channel, h: Handler, onFirst: () => Promise<void>, onLast: () => void): Subscription {
    const wrapped = (m: RealtimeMessage, id?: string) => {
      try {
        h(m, ch, id);
      } catch (err) {
        logger.warn({ err, channel_kind: channelKind(ch) }, 'bus handler failed');
      }
    };
    const first = this.count(ch) === 0;
    this.emitter.on(ch, wrapped);
    if (first) this.ready.set(ch, onFirst());
    let done = false;
    const off = () => {
      if (done) return;
      done = true;
      this.emitter.off(ch, wrapped);
      if (this.count(ch) === 0) {
        this.ready.delete(ch);
        onLast();
      }
    };
    return Object.assign(off, { ready: this.ready.get(ch) ?? Promise.resolve() });
  }
  emit(ch: Channel, m: RealtimeMessage, id?: string): void {
    observeFanout(ch, m);
    this.emitter.emit(ch, m, id);
  }
}

class MemoryBus implements Bus {
  readonly kind = 'memory' as const;
  private local = new LocalFanout();
  private buffers = new Map<string, { id: string; msg: RealtimeMessage }[]>();
  private lastMs = 0;
  private seq = 0;

  private nextId(): string {
    const now = Date.now();
    if (now > this.lastMs) {
      this.lastMs = now;
      this.seq = 0;
    } else this.seq++;
    return `${this.lastMs}-${this.seq}`;
  }

  async publish(channel: Channel, msg: RealtimeMessage) {
    const id = this.nextId();
    const buf = this.buffers.get(channel) ?? [];
    buf.push({ id, msg });
    while (buf.length > REPLAY_MAX || (buf[0] && idAgeMs(buf[0].id) > REPLAY_TTL_MS)) buf.shift();
    this.buffers.set(channel, buf);
    this.local.emit(channel, msg, id);
  }
  subscribe(channel: Channel, handler: Handler) {
    return this.local.on(
      channel,
      handler,
      async () => {},
      () => {},
    );
  }
  async replay(channel: Channel, afterId: string): Promise<Replay> {
    const buf = this.buffers.get(channel) ?? [];
    const first = buf[0]?.id;
    const trimmed = buf.length >= REPLAY_MAX && !!first && compareIds(first, afterId) > 0;
    return {
      entries: buf.filter((e) => compareIds(e.id, afterId) > 0),
      complete: idAgeMs(afterId) <= REPLAY_TTL_MS && !trimmed,
    };
  }
  async close() {}
}

const bufKey = (channel: Channel) => `sse:buf:${channel}`;
/** Global id source: a 1-entry stream whose auto ids are monotonic across all channels. */
const ID_KEY = 'sse:ids';
/**
 * One atomic round trip: take the next global id, append the message to the channel's
 * replay buffer under that explicit id (ids stay unique across channels, so a client
 * multiplexing session + user channels can dedupe and resume on a single Last-Event-ID).
 */
const XADD_GLOBAL = `local id = redis.call('XADD', KEYS[1], 'MAXLEN', '1', '*', 'n', '1')
redis.call('XADD', KEYS[2], 'MAXLEN', '~', ARGV[1], id, 'm', ARGV[2])
redis.call('PEXPIRE', KEYS[2], ARGV[3])
return id`;

class ValkeyBus implements Bus {
  readonly kind = 'valkey' as const;
  private local = new LocalFanout();
  private pub: Redis;
  private sub: Redis;

  constructor(url: string) {
    const opts = {
      lazyConnect: false,
      connectTimeout: 2000,
      commandTimeout: 500,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
      retryStrategy: (n: number) => Math.min(n * 200, 5000),
    };
    this.pub = new Redis(url, { ...opts, connectionName: 'lanyard-pub' });
    // Subscriber connections must not use commandTimeout (blocking by design).
    this.sub = new Redis(url, {
      ...opts,
      commandTimeout: undefined,
      connectionName: 'lanyard-sub',
    });
    for (const c of [this.pub, this.sub]) {
      c.on('error', (err) => logger.warn({ err: err.message }, 'valkey connection error'));
    }
    this.sub.on('message', (ch: string, raw: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      const id = (parsed as { _id?: unknown })._id;
      const msg = RealtimeMessage.safeParse(parsed); // strips _id
      if (msg.success)
        this.local.emit(ch as Channel, msg.data, typeof id === 'string' ? id : undefined);
    });
  }

  async publish(channel: Channel, msg: RealtimeMessage) {
    const json = JSON.stringify(msg);
    let id: string | undefined;
    try {
      const v = await this.pub.eval(
        XADD_GLOBAL,
        2,
        ID_KEY,
        bufKey(channel),
        String(REPLAY_MAX),
        json,
        String(REPLAY_TTL_MS * 2),
      );
      id = typeof v === 'string' ? v : undefined;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'replay buffer write failed');
    }
    await this.pub.publish(channel, id ? JSON.stringify({ ...msg, _id: id }) : json);
  }

  subscribe(channel: Channel, handler: Handler) {
    return this.local.on(
      channel,
      handler,
      () => this.subscribeWithRetry(channel),
      () => void this.sub.unsubscribe(channel).catch(() => {}),
    );
  }

  async replay(channel: Channel, afterId: string): Promise<Replay> {
    if (idAgeMs(afterId) > REPLAY_TTL_MS) return { entries: [], complete: false };
    try {
      const key = bufKey(channel);
      const [rowsRes, firstRes, lenRes] =
        (await this.pub
          .multi()
          .xrange(key, `(${afterId}`, '+', 'COUNT', REPLAY_MAX)
          .xrange(key, '-', '+', 'COUNT', 1)
          .xlen(key)
          .exec()) ?? [];
      const rows = (rowsRes?.[1] ?? []) as [string, string[]][];
      const first = ((firstRes?.[1] ?? []) as [string, string[]][])[0]?.[0];
      const len = Number(lenRes?.[1] ?? 0);
      const entries = rows.flatMap(([id, fields]) => {
        const r = RealtimeMessage.safeParse(JSON.parse(fields[1] ?? 'null'));
        return r.success ? [{ id, msg: r.data }] : [];
      });
      // A capped buffer whose oldest entry is newer than the cursor may have been trimmed
      // past it: coverage is unproven, so the caller sends a snapshot. (A missing key means
      // nothing was published on this channel for 2x the TTL, so nothing was missed.)
      const trimmed = len >= REPLAY_MAX * 0.9 && !!first && compareIds(first, afterId) > 0;
      return { entries, complete: !trimmed };
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'replay read failed');
      return { entries: [], complete: false };
    }
  }

  /** SUBSCRIBE, retrying with backoff while anyone still listens; never rejects. */
  private async subscribeWithRetry(channel: Channel): Promise<void> {
    for (let delay = 250; this.local.count(channel) > 0; delay = Math.min(delay * 2, 5000)) {
      try {
        await this.sub.subscribe(channel);
        return;
      } catch (err) {
        logger.warn(
          { err: (err as Error).message, channel_kind: channelKind(channel) },
          'subscribe failed; retrying',
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  async close() {
    this.pub.disconnect();
    this.sub.disconnect();
  }
}

export function createBus(valkeyUrl: string | undefined): Bus {
  if (!valkeyUrl) {
    logger.warn('VALKEY_URL not set: using in-process bus (single pod only)');
    return new MemoryBus();
  }
  return new ValkeyBus(valkeyUrl);
}

/** Valkey client for counters (occupancy, votes). Undefined when VALKEY_URL is unset. */
export function createValkeyClient(valkeyUrl: string | undefined): Redis | undefined {
  if (!valkeyUrl) return undefined;
  const c = new Redis(valkeyUrl, {
    connectTimeout: 2000,
    commandTimeout: 500,
    maxRetriesPerRequest: 1,
    retryStrategy: (n: number) => Math.min(n * 200, 5000),
    connectionName: 'lanyard-kv',
  });
  c.on('error', (err) => logger.warn({ err: err.message }, 'valkey connection error'));
  return c;
}
