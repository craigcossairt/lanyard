import { useEffect, useRef, useState } from 'react';
import { EventView, OpsSnapshot } from '@lanyard/contracts';
import { api } from '../../app/api';
import { useSse } from '../../app/sse';

export function useOps(eventId: string) {
  const [data, setData] = useState<{ snapshot: OpsSnapshot; view: EventView; at: string }>();
  const [error, setError] = useState(false);
  const refresh = useRef<() => void>(() => {});
  const path = `/events/${encodeURIComponent(eventId)}`;
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    let dirty = false;
    let deferred: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (cancelled) return;
      if (pending) {
        dirty = true;
        return;
      }
      pending = true;
      try {
        const [snapshot, view] = await Promise.all([
          api.get<unknown>(`${path}/ops`).then((v) => OpsSnapshot.parse(v)),
          api.event(eventId).then((v) => EventView.parse(v)),
        ]);
        if (!cancelled) {
          setData({ snapshot, view, at: new Date().toISOString() });
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        pending = false;
        if (dirty && !cancelled) {
          dirty = false;
          void load();
        }
      }
    };
    // Coalesce fan-out bursts so 200 check-ins do not trigger 200 snapshots.
    refresh.current = () => {
      if (!deferred)
        deferred = setTimeout(() => {
          deferred = undefined;
          void load();
        }, 300);
    };
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(deferred);
      refresh.current = () => {};
    };
  }, [eventId, path]);
  const stream = useSse(`${path}/ops/stream`, () => refresh.current(), {
    onReconnect: () => refresh.current(),
  });
  return { data, error, stream, refresh: () => refresh.current() };
}
