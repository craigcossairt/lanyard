// React access to the active token's claims; re-renders on sign-in, switch or sign-out.
import { useSyncExternalStore } from 'react';
import { getSession, onAuthChange, type Session } from './auth';

// Snapshot is read from localStorage on every render (cheap) and only replaced when the
// token changes, so it is never stale (e.g. a #t= token captured after this module loaded)
// and stays referentially stable for useSyncExternalStore.
let cached: Session | undefined;
function snapshot(): Session | undefined {
  const s = getSession();
  if (s?.token !== cached?.token) cached = s;
  return cached;
}

/** The active session (token + claims), or undefined when signed out. */
export function useSession(): Session | undefined {
  return useSyncExternalStore(onAuthChange, snapshot);
}
