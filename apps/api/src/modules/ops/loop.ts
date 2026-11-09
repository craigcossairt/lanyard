import { randomUUID } from 'node:crypto';
import { channels, EVENT_IDS } from '@lanyard/contracts';
import type { ModuleContext } from '../../core/context';
import { createOpsMetrics } from './metrics';
import { evaluateAlerts } from './rules';
import { alertKey, readOps } from './snapshot';

export const OPS_INTERVAL_MS = 10_000;
const LEASE_MS = 20_000;
const leaseKey = (eventId: string) => `ops:${eventId}:lease`;
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
  for i = 3, #KEYS do
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
    if (!ctx.kv) return;
    for (const eventId of Object.values(EVENT_IDS)) {
      if (stopped) return;
      try {
        const elected = await ctx.kv.eval(acquire, 1, leaseKey(eventId), owner, LEASE_MS);
        if (!elected) {
          telemetry.clear(eventId);
          continue;
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
          ...reading.snapshot.rooms.map((s) => historyKey(eventId, s.room.id)),
        ];
        const points = reading.snapshot.rooms.map((s) =>
          JSON.stringify({ at, occupancy: s.occupancy, signals: s.signals }),
        );
        if (stopped) return;
        const saved = await ctx.kv.eval(
          commit,
          keys.length,
          ...keys,
          owner,
          JSON.stringify(alerts),
          ...points,
        );
        if (!saved) {
          telemetry.clear(eventId);
          continue;
        }
        telemetry.update(eventId, { ...reading, snapshot: { ...reading.snapshot, alerts } });
        // Failures are visible through snapshot refresh; never log payloads or Redis errors.
        await Promise.all(
          transitions.map((message) => ctx.bus.publish(channels.ops(eventId), message)),
        );
      } catch {
        telemetry.clear(eventId);
        ctx.logger.warn({ event: eventId }, 'ops refresh unavailable');
      }
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
