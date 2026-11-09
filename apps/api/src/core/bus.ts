// Typed realtime bus. Valkey pub/sub when VALKEY_URL is set; an in-process bus
// otherwise (single pod / local dev), so nothing hard-fails without Valkey.
//   await bus.publish(channels.session(id), realtime('caption.appended', {...}))
//   const off = bus.subscribe(channels.user(anonId), (msg) => ...)
import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';
import { metrics } from '@opentelemetry/api';
import { channelKind, METRICS, RealtimeMessage, type Channel } from '@lanyard/contracts';
import { logger } from './logger';

export type Handler = (msg: RealtimeMessage, channel: Channel) => void;

export interface Bus {
  readonly kind: 'valkey' | 'memory';
  publish(channel: Channel, msg: RealtimeMessage): Promise<void>;
  /** Returns an unsubscribe function. */
  subscribe(channel: Channel, handler: Handler): () => void;
  close(): Promise<void>;
}

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
  count = (ch: string) => this.emitter.listenerCount(ch);
  on(ch: Channel, h: Handler, onFirst: () => void, onLast: () => void): () => void {
    const wrapped = (m: RealtimeMessage) => {
      try {
        h(m, ch);
      } catch (err) {
        logger.warn({ err, channel_kind: channelKind(ch) }, 'bus handler failed');
      }
    };
    if (this.count(ch) === 0) onFirst();
    this.emitter.on(ch, wrapped);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.emitter.off(ch, wrapped);
      if (this.count(ch) === 0) onLast();
    };
  }
  emit(ch: Channel, m: RealtimeMessage): void {
    observeFanout(ch, m);
    this.emitter.emit(ch, m);
  }
}

class MemoryBus implements Bus {
  readonly kind = 'memory' as const;
  private local = new LocalFanout();
  async publish(channel: Channel, msg: RealtimeMessage) {
    this.local.emit(channel, msg);
  }
  subscribe(channel: Channel, handler: Handler) {
    return this.local.on(
      channel,
      handler,
      () => {},
      () => {},
    );
  }
  async close() {}
}

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
      const msg = RealtimeMessage.safeParse(parsed);
      if (msg.success) this.local.emit(ch as Channel, msg.data);
    });
  }

  async publish(channel: Channel, msg: RealtimeMessage) {
    await this.pub.publish(channel, JSON.stringify(msg));
  }

  subscribe(channel: Channel, handler: Handler) {
    return this.local.on(
      channel,
      handler,
      () =>
        void this.sub
          .subscribe(channel)
          .catch((err) => logger.warn({ err: err.message }, 'subscribe failed')),
      () => void this.sub.unsubscribe(channel).catch(() => {}),
    );
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
