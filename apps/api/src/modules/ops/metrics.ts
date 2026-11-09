import { metrics, type Meter } from '@opentelemetry/api';
import { METRICS, type OpsSnapshot } from '@lanyard/contracts';
import type { OpsReading } from './snapshot';

/** A failed refresh stops observations instead of reporting old occupancy as healthy. */
export function createOpsMetrics(meter: Meter = metrics.getMeter('lanyard')) {
  const samples = new Map<
    string,
    { snapshot: OpsSnapshot; attendees: Map<string, number>; expires: number }
  >();
  const occupancy = meter.createObservableGauge(METRICS.roomOccupancy);
  const capacity = meter.createObservableGauge(METRICS.roomCapacity);
  const attendees = meter.createObservableGauge(METRICS.sessionAttendees);
  const observe: Parameters<Meter['addBatchObservableCallback']>[0] = (result) => {
    for (const [event, { snapshot, attendees: counts, expires }] of samples) {
      if (expires <= Date.now()) continue;
      for (const status of snapshot.rooms) {
        const attributes = { event, room: status.room.id };
        result.observe(occupancy, status.occupancy, attributes);
        result.observe(capacity, status.room.capacity, attributes);
        if (status.sessionId) {
          result.observe(attendees, counts.get(status.sessionId) ?? 0, {
            ...attributes,
            session: status.sessionId,
          });
        }
      }
    }
  };
  const gauges = [occupancy, capacity, attendees];
  meter.addBatchObservableCallback(observe, gauges);
  return {
    update(event: string, reading: OpsReading) {
      samples.set(event, { ...reading, expires: Date.now() + 20_000 });
    },
    clear(event: string) {
      samples.delete(event);
    },
    close() {
      meter.removeBatchObservableCallback(observe, gauges);
      samples.clear();
    },
  };
}
