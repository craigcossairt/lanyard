import { useEffect, useState } from 'react';
import type { EventView, Room } from '@lanyard/contracts';
import { api, ApiError } from './api';

const cache = new Map<string, { at: number; view: EventView }>();
const TTL_MS = 30_000;
const REVALIDATE_MS = 60_000;

export async function fetchEventView(eventId: string, force = false): Promise<EventView> {
  const hit = cache.get(eventId);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.view;
  const view = await api.get<EventView>(`/events/${encodeURIComponent(eventId)}`);
  cache.set(eventId, { at: Date.now(), view });
  return view;
}

export interface EventState {
  view: EventView | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useEventView(eventId: string): EventState {
  const [view, setView] = useState<EventView | null>(() => cache.get(eventId)?.view ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!view);
  const [tick, setTick] = useState(0);

  // Revalidate while the screen stays open: talks start and end under the attendee.
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const timer = setInterval(bump, REVALIDATE_MS);
    const onVisible = () => document.visibilityState === 'visible' && bump();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchEventView(eventId, tick > 0)
      .then((v) => {
        if (!alive) return;
        setView(v);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiError ? e.message : 'Could not load the event');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [eventId, tick]);

  return { view, error, loading, reload: () => setTick((t) => t + 1) };
}

export function roomById(rooms: Room[] | undefined, id: string): Room | undefined {
  return rooms?.find((r) => r.id === id);
}
