// My Schedule: a set of session ids per event. Kept on the device (so it survives a
// reload with no account) and mirrored to PUT /me/schedule when the API has it.
import { useCallback, useSyncExternalStore } from 'react';
import type { MySchedule, Session } from '@lanyard/contracts';
import { api } from './api';

const KEY = (eventId: string) => `lanyard.schedule.${eventId}`;
const CACHE = (eventId: string) => `lanyard.schedule-cache.${eventId}`;

interface Stored {
  sessionIds: string[];
}

const listeners = new Set<() => void>();
const snapshots = new Map<string, Stored>();

function read(eventId: string): Stored {
  const cached = snapshots.get(eventId);
  if (cached) return cached;
  let value: Stored = { sessionIds: [] };
  try {
    const raw = localStorage.getItem(KEY(eventId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored>;
      if (Array.isArray(parsed.sessionIds)) value = { sessionIds: parsed.sessionIds };
    }
  } catch {
    // Nothing saved: an empty schedule.
  }
  snapshots.set(eventId, value);
  return value;
}

function write(eventId: string, next: Stored): void {
  snapshots.set(eventId, next);
  try {
    localStorage.setItem(KEY(eventId), JSON.stringify(next));
  } catch {
    // Private mode: in-memory only.
  }
  listeners.forEach((l) => l());
  // Best effort mirror. A missing route (404) or an expired token must never break the UI.
  const body: MySchedule = { sessionIds: next.sessionIds };
  void api.put('/me/schedule', body).catch(() => undefined);
}

/** Session details for the ids we keep, so the list renders offline and instantly. */
export function rememberSessions(eventId: string, sessions: Session[]): void {
  if (sessions.length === 0) return;
  try {
    const raw = localStorage.getItem(CACHE(eventId));
    const map: Record<string, Session> = raw ? (JSON.parse(raw) as Record<string, Session>) : {};
    for (const s of sessions) map[s.id] = s;
    // Keep the cache to the saved ids plus a little slack.
    const keep = new Set(read(eventId).sessionIds);
    const entries = Object.entries(map).filter(([id]) => keep.has(id) || sessions.some((s) => s.id === id));
    localStorage.setItem(CACHE(eventId), JSON.stringify(Object.fromEntries(entries.slice(-200))));
  } catch {
    // Cache is optional.
  }
}

export function cachedSessions(eventId: string): Record<string, Session> {
  try {
    const raw = localStorage.getItem(CACHE(eventId));
    return raw ? (JSON.parse(raw) as Record<string, Session>) : {};
  } catch {
    return {};
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useMySchedule(eventId: string) {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(eventId),
    () => read(eventId),
  );
  const has = useCallback((id: string) => stored.sessionIds.includes(id), [stored]);
  const toggle = useCallback(
    (session: Session) => {
      const cur = read(eventId);
      const next = cur.sessionIds.includes(session.id)
        ? cur.sessionIds.filter((x) => x !== session.id)
        : [...cur.sessionIds, session.id];
      rememberSessions(eventId, [session]);
      write(eventId, { sessionIds: next });
      return !cur.sessionIds.includes(session.id);
    },
    [eventId],
  );
  const add = useCallback(
    (sessions: Session[]) => {
      const cur = read(eventId);
      const ids = new Set(cur.sessionIds);
      sessions.forEach((s) => ids.add(s.id));
      rememberSessions(eventId, sessions);
      write(eventId, { sessionIds: [...ids] });
    },
    [eventId],
  );
  return { sessionIds: stored.sessionIds, has, toggle, add };
}
