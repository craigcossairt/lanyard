// React access to the active token's claims; re-renders on sign-in, switch or sign-out.
import { useSyncExternalStore } from 'react';
import { getSession, onAuthChange, type Session } from './auth';

let cached: Session | undefined = getSession();
const subscribe = (cb: () => void) =>
  onAuthChange(() => {
    cached = getSession();
    cb();
  });

/** The active session (token + claims), or undefined when signed out. */
export function useSession(): Session | undefined {
  return useSyncExternalStore(subscribe, () => cached);
}
