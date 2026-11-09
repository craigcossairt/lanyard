// Token storage for the SPA. Tokens live in localStorage, never in URLs. Role links
// arrive as /join#t=<token>; captureFragmentToken() saves the token and strips the
// fragment with history.replaceState BEFORE RUM starts (main.tsx calls it first).
import type { Role, TokenClaims } from '@lanyard/contracts';

const ACTIVE = 'lanyard.token';
const BY_ROLE = 'lanyard.tokens'; // role -> token, for the dev role switcher

export interface Session {
  token: string;
  claims: TokenClaims;
}

/** Decode (not verify; the server verifies) the claims part of a token. */
export function decodeClaims(token: string): TokenClaims | undefined {
  try {
    const body = token.split('.')[0] ?? '';
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as TokenClaims;
    return claims.exp * 1000 > Date.now() ? claims : undefined;
  } catch {
    return undefined;
  }
}

function readMap(): Partial<Record<Role, string>> {
  try {
    return JSON.parse(localStorage.getItem(BY_ROLE) ?? '{}') as Partial<Record<Role, string>>;
  } catch {
    return {};
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();
export function onAuthChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSession(): Session | undefined {
  const token = localStorage.getItem(ACTIVE);
  const claims = token ? decodeClaims(token) : undefined;
  return token && claims ? { token, claims } : undefined;
}

/** Store a token as the active one (and remember it per role). Returns its claims. */
export function saveToken(token: string): TokenClaims | undefined {
  const claims = decodeClaims(token);
  if (!claims) return undefined;
  localStorage.setItem(ACTIVE, token);
  localStorage.setItem(BY_ROLE, JSON.stringify({ ...readMap(), [claims.role]: token }));
  listeners.forEach((l) => l());
  return claims;
}

/** Tokens remembered per role (dev role switcher). Expired ones are dropped. */
export function rememberedRoles(): Session[] {
  return Object.values(readMap()).flatMap((token) => {
    const claims = token ? decodeClaims(token) : undefined;
    return token && claims ? [{ token, claims }] : [];
  });
}

export function signOut(): void {
  localStorage.removeItem(ACTIVE);
  listeners.forEach((l) => l());
}

/** If the URL has #t=<token>, save it and remove it from the address bar. */
export function captureFragmentToken(): TokenClaims | undefined {
  const m = /(?:^#|&)t=([^&]+)/.exec(window.location.hash);
  if (!m?.[1]) return undefined;
  const claims = saveToken(decodeURIComponent(m[1]));
  history.replaceState(history.state, '', window.location.pathname + window.location.search);
  return claims;
}

/** Persona home for a role. */
export const homeFor = (role: Role): string =>
  ({ attendee: '/a', speaker: '/s', organizer: '/o', vendor: '/v', venue: '/venue' })[role];
