// The active identity, from the shell's session store (apps/web/src/app/session.ts),
// flattened to the fields persona screens use.
import { EVENT_IDS, type Role } from '@lanyard/contracts';
import { useSession as useShellSession } from '../../../app/session';

export interface SessionClaims {
  anonId: string;
  role: Role;
  eventId: string;
  handle?: string;
}

/** The signed-in identity, or null before joining. */
export function useSession(): SessionClaims | null {
  const s = useShellSession();
  if (!s) return null;
  const { sub, role, eventId, handle } = s.claims;
  return { anonId: sub, role, eventId, handle };
}

/** The event this device belongs to; CNH Demos is the default for a cold start. */
export function useEventId(): string {
  return useSession()?.eventId ?? EVENT_IDS.cnhDemos;
}
