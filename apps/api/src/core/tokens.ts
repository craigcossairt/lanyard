// Signed role tokens: base64url(JSON claims) + "." + base64url(HMAC-SHA256).
// The key comes only from TOKEN_SIGNING_KEY. Tokens travel in the Authorization header,
// or in a URL *fragment* for role links (/join#t=<token>), never in a query string.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { TokenClaims, type Role } from '@lanyard/contracts';

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

export class TokenError extends Error {}

export function signToken(
  key: string,
  claims: { sub: string; role: Role; eventId: string; handle?: string },
  ttlSeconds: number,
): { token: string; claims: TokenClaims } {
  const iat = Math.floor(Date.now() / 1000);
  const full: TokenClaims = { ...claims, iat, exp: iat + ttlSeconds };
  const body = b64(JSON.stringify(full));
  const sig = createHmac('sha256', key).update(body).digest('base64url');
  return { token: `${body}.${sig}`, claims: full };
}

export function verifyToken(key: string, token: string): TokenClaims {
  const [body, sig] = token.split('.');
  if (!body || !sig) throw new TokenError('malformed token');
  const expected = createHmac('sha256', key).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new TokenError('bad signature');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new TokenError('malformed token');
  }
  const claims = TokenClaims.safeParse(parsed);
  if (!claims.success) throw new TokenError('malformed claims');
  if (claims.data.exp * 1000 < Date.now()) throw new TokenError('token expired');
  return claims.data;
}

export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url')}`;

/** Role links put the token in the fragment so it never reaches servers, logs or RUM. */
export const joinLink = (baseUrl: string, token: string) =>
  `${baseUrl.replace(/\/$/, '')}/join#t=${token}`;

const ADJ = [
  'Teal',
  'Amber',
  'Swift',
  'Quiet',
  'Bright',
  'Clever',
  'Brave',
  'Lucky',
  'Calm',
  'Sunny',
  'Misty',
  'Bold',
];
const ANIMAL = [
  'Otter',
  'Falcon',
  'Lynx',
  'Heron',
  'Marmot',
  'Fox',
  'Bison',
  'Owl',
  'Pika',
  'Moose',
  'Wren',
  'Badger',
];
export function randomHandle(): string {
  const pick = (a: string[]) => a[randomBytes(1)[0]! % a.length]!;
  return `${pick(ADJ)} ${pick(ANIMAL)}`;
}
