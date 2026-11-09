// TEMP adapter (WS3): the active token's claims. The WS0 shell's `useSession()` replaces it.
import { useSyncExternalStore } from 'react';
import { EVENT_IDS, type Role, type TokenClaims } from '@lanyard/contracts';
import { getToken, TOKEN_KEY } from './api';

export interface SessionClaims {
  anonId: string;
  role: Role;
  eventId: string;
  handle?: string;
}

/** Tokens are base64url(JSON claims) + "." + signature. Only the server verifies them. */
export function decodeClaims(token: string | null): SessionClaims | null {
  if (!token) return null;
  const body = token.split('.')[0];
  if (!body) return null;
  try {
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    const c = JSON.parse(json) as Partial<TokenClaims>;
    if (!c.sub || !c.role || !c.eventId) return null;
    if (typeof c.exp === 'number' && c.exp * 1000 < Date.now()) return null;
    return { anonId: c.sub, role: c.role, eventId: c.eventId, handle: c.handle };
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
export function notifySessionChanged(): void {
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === TOKEN_KEY) l();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

let cachedToken: string | null | undefined;
let cachedClaims: SessionClaims | null = null;
function snapshot(): SessionClaims | null {
  const t = getToken();
  if (t !== cachedToken) {
    cachedToken = t;
    cachedClaims = decodeClaims(t);
  }
  return cachedClaims;
}

/** The signed-in identity, or null before joining. */
export function useSession(): SessionClaims | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** The event this device belongs to; CNH Demos is the default for a cold start. */
export function useEventId(): string {
  return useSession()?.eventId ?? EVENT_IDS.cnhDemos;
}
