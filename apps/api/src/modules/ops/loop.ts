import { randomUUID } from 'node:crypto';
import { trace } from '@opentelemetry/api';
import { channels, EVENT_IDS, RealtimeMessage } from '@lanyard/contracts';
import type { ModuleContext } from '../../core/context';
import { HttpError } from '../../core/errors';
import { createOpsMetrics } from './metrics';
import { evaluateAlerts } from './rules';
import { alertKey, recordOpsError, readOps } from './snapshot';

export const OPS_INTERVAL_MS = 10_000;
const LEASE_MS = 20_000;
const leaseKey = (eventId: string) => `ops:${eventId}:lease`;
const pendingKey = (eventId: string) => `ops:${eventId}:pending`;
const tracer = trace.getTracer('lanyard-ops');
const acknowledge = `
  if redis.call('HGET', KEYS[1], ARGV[1]) == ARGV[2] then
    return redis.call('HDEL', KEYS[1], ARGV[1])
  end
  return 0
`;
export const historyKey = (eventId: string, roomId: string) => `ops:${eventId}:history:${roomId}`;

// Renew only our own lease. SET NX makes this safe across app replicas.
const acquire = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('PEXPIRE', KEYS[1], ARGV[2])
  end
  return redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2])
`;
// Fence late readers after a failover; atomically retain alerts and 30 minutes of history.
const commit = `
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  redis.call('SET', KEYS[2], ARGV[2], 'EX', 86400)
  for id, message in pairs(cjson.decode(ARGV[3])) do
    redis.call('HSET', KEYS[3], id, cjson.encode(message))
  end
  redis.call('EXPIRE', KEYS[3], 86400)
  for i = 4, #KEYS do
    redis.call('LPUSH', KEYS[i], ARGV[i])
    redis.call('LTRIM', KEYS[i], 0, 179)
    redis.call('EXPIRE', KEYS[i], 3600)
  end
  return 1
`;

export function createOpsLoop(ctx: ModuleContext, read = readOps, telemetry = createOpsMetrics()) {
  const owner = randomUUID();
  let running = false;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight: Promise<void> = Promise.resolve();
  const refresh = async () => {
    const kv = ctx.kv;
    if (!kv) return;
    for (const eventId of Object.values(EVENT_IDS)) {
      if (stopped) return;
      await tracer.startActiveSpan(
        'ops.refresh',
        { attributes: { event: eventId } },
        async (span) => {
          try {
            const elected = await kv.eval(acquire, 1, leaseKey(eventId), owner, LEASE_MS);
            if (!elected) {
              telemetry.clear(eventId);
              return;
            }
            const at = new Date().toISOString();
            const reading = await read(ctx, eventId, new Date(at));
            const { alerts, transitions } = evaluateAlerts(
              eventId,
              reading.snapshot.rooms,
              reading.snapshot.alerts,
              at,
            );
            const keys = [
              leaseKey(eventId),
              alertKey(eventId),
              pendingKey(eventId),
              ...reading.snapshot.rooms.map((s) => historyKey(eventId, s.room.id)),
            ];
            const points = reading.snapshot.rooms.map((s) =>
              JSON.stringify({ at, occupancy: s.occupancy, signals: s.signals }),
            );
            if (stopped) return;
            const saved = await kv.eval(
              commit,
              keys.length,
              ...keys,
              owner,
              JSON.stringify(alerts),
              JSON.stringify(
                Object.fromEntries(
                  // Latest state wins: a resolution replaces an undelivered opening.
                  transitions.map((m) => ['id' in m.payload ? m.payload.id : '', m]),
                ),
              ),
              ...points,
            );
            if (!saved) {
              telemetry.clear(eventId);
              return;
            }
            telemetry.update(eventId, { ...reading, snapshot: { ...reading.snapshot, alerts } });
            // Durable outbox: retry after a timeout or replica replacement. Delivery is at-least-once.
            try {
              const [, pending] = await kv.hscan(pendingKey(eventId), '0', 'COUNT', 100);
              const deliveries: Promise<void>[] = [];
              for (let i = 0; i < Math.min(pending.length, 200); i += 2) {
                const id = pending[i]!;
                deliveries.push(
                  (async () => {
                    const raw = pending[i + 1]!;
                    const message = RealtimeMessage.parse(JSON.parse(raw));
                    await ctx.bus.publish(channels.ops(eventId), message);
                    // A late publisher must not delete a newer state saved by a successor.
                    await kv.eval(acknowledge, 1, pendingKey(eventId), id, raw);
                  })(),
                );
              }
              const results = await Promise.allSettled(deliveries);
              if (results.some((r) => r.status === 'rejected')) throw new Error('publish failed');
            } catch {
              // Keep fresh gauges; the outbox survives and the next elected tick retries it.
              recordOpsError(ctx, eventId, 'Ops alert delivery will retry');
            }
          } catch (error) {
            telemetry.clear(eventId);
            if (!(error instanceof HttpError && error.code === 'ops_unavailable')) {
              recordOpsError(ctx, eventId, 'Ops refresh unavailable');
            }
          } finally {
            span.end();
          }
        },
      );
    }
  };
  const tick = () => {
    if (running || stopped) return inFlight;
    running = true;
    inFlight = refresh().finally(() => {
      running = false;
    });
    return inFlight;
  };
  return {
    tick,
    start() {
      if (timer || stopped) return;
      void tick();
      timer = setInterval(() => void tick(), OPS_INTERVAL_MS);
      timer.unref();
    },
    async close() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
      telemetry.close();
      // The lease expires naturally; never delete a successor's lease on shutdown.
    },
  };
}
