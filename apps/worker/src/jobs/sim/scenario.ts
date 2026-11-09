// Deterministic, bounded crowd scenario. The runner sends these actions through
// normal attendee routes; this module never writes WS2's live-state keys.
export const MAX_ATTENDEES = 200;
export const MAX_DURATION_MS = 10 * 60_000;
export const BATCH_SIZE = 5;

export interface Crowd {
  id: string;
  sessions: [string, string];
  attendees: number;
  startedAt: string;
  endsAt: string;
  stopping: boolean;
  cursor: number;
}

export interface Action {
  actor: number;
  sessionId: string;
  kind: 'join' | 'leave' | 'signal' | 'question';
}

export function createCrowd(id: string, sessions: [string, string], attendees: number, now: number): Crowd {
  if (!Number.isInteger(attendees) || attendees < 1 || attendees > MAX_ATTENDEES) {
    throw new RangeError('Crowd must contain 1–200 attendees');
  }
  if (!sessions[0] || !sessions[1] || sessions[0] === sessions[1]) {
    throw new Error('Two distinct current sessions are required');
  }
  return { id, sessions, attendees, startedAt: new Date(now).toISOString(),
    endsAt: new Date(now + MAX_DURATION_MS).toISOString(), stopping: false, cursor: 0 };
}

export const actorId = (crowd: Crowd, actor: number) => `sim_${crowd.id}_${actor}`;

/** One bounded batch; advance cursor only after all actions succeed. Retrying a
 * presence action is idempotent. Cleanup leaves both sessions even after restart. */
export function nextBatch(crowd: Crowd, now: number): { actions: Action[]; done: boolean } {
  const stopping = crowd.stopping || now >= Date.parse(crowd.endsAt);
  const limit = stopping ? crowd.attendees * 2 : crowd.attendees;
  if (crowd.cursor >= limit) return { actions: [], done: true };
  const actions: Action[] = [];
  for (let n = crowd.cursor; n < Math.min(limit, crowd.cursor + BATCH_SIZE); n++) {
    const actor = stopping ? Math.floor(n / 2) : n;
    const stage = stopping ? n % 2 : actor < Math.ceil(crowd.attendees * 0.85) ? 0 : 1;
    actions.push({ actor, sessionId: crowd.sessions[stage]!, kind: stopping ? 'leave' : 'join' });
  }
  return { actions, done: false };
}

/** One ambient action every five seconds after entry: synthetic questions are
 * capped at one per 30 seconds; signals use distinct actors and normal rate limits. */
export function ambientAction(crowd: Crowd, step: number): Action {
  const actor = step % crowd.attendees;
  if (step % 6 === 5) return { actor, sessionId: crowd.sessions[0], kind: 'question' };
  if (step % 6 === 4) return { actor, sessionId: crowd.sessions[1], kind: 'join' };
  return { actor, sessionId: crowd.sessions[0], kind: 'signal' };
}
