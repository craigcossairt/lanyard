// Auth helpers for route modules. Tokens come ONLY from `Authorization: Bearer <token>`
// (SSE included: the web client streams with fetch + header). No query-string tokens.
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { Role, TokenClaims } from '@lanyard/contracts';
import { HttpError } from './errors';
import { TokenError, verifyToken } from './tokens';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: TokenClaims;
  }
}

let signingKey: string | undefined;
export function setSigningKey(key: string | undefined): void {
  signingKey = key;
}
export function getSigningKey(): string {
  if (!signingKey) throw new HttpError(503, 'auth_unconfigured', 'TOKEN_SIGNING_KEY is not set');
  return signingKey;
}

function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  if (!h) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1]?.trim();
}

/** Parses the token if present; never throws on a missing token. */
export function readAuth(req: FastifyRequest): TokenClaims | undefined {
  const t = bearer(req);
  if (!t) return undefined;
  try {
    return verifyToken(getSigningKey(), t);
  } catch (err) {
    if (err instanceof TokenError) throw new HttpError(401, 'invalid_token', err.message);
    throw err;
  }
}

/**
 * preHandler that requires a valid token, optionally one of `roles`.
 * Organizer tokens pass every role check (the organizer can see everything).
 *   app.post('/x', { preHandler: requireRole('speaker') }, handler)
 */
export function requireRole(...roles: Role[]): preHandlerAsyncHookHandler {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const claims = readAuth(req);
    if (!claims) throw new HttpError(401, 'unauthorized', 'Missing bearer token');
    if (roles.length > 0 && !roles.includes(claims.role) && claims.role !== 'organizer') {
      throw new HttpError(403, 'forbidden', `Requires role: ${roles.join(' or ')}`);
    }
    req.auth = claims;
  };
}

/** Same as requireRole() with no roles: any valid token. */
export const requireAuth = (): preHandlerAsyncHookHandler => requireRole();

/** The claims set by requireRole/requireAuth; throws if a route forgot the preHandler. */
export function authOf(req: FastifyRequest): TokenClaims {
  if (!req.auth) throw new HttpError(401, 'unauthorized', 'Missing bearer token');
  return req.auth;
}
