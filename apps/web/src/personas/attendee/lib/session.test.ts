// Smoke test for the shell's token decoder, which the attendee session wrapper builds on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeClaims } from '../../../app/auth';

const b64url = (s: string) => Buffer.from(s).toString('base64url');
const token = (claims: Record<string, unknown>) => `${b64url(JSON.stringify(claims))}.sig`;

test('decodeClaims reads attendee claims from the token body', () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const c = decodeClaims(
    token({
      sub: 'a_1',
      role: 'attendee',
      eventId: 'cnh-demos',
      handle: 'Teal Otter',
      iat: 1,
      exp,
    }),
  );
  assert.equal(c?.sub, 'a_1');
  assert.equal(c?.role, 'attendee');
  assert.equal(c?.eventId, 'cnh-demos');
  assert.equal(c?.handle, 'Teal Otter');
});

test('decodeClaims rejects expired and malformed tokens', () => {
  const past = Math.floor(Date.now() / 1000) - 10;
  assert.equal(
    decodeClaims(token({ sub: 'a', role: 'attendee', eventId: 'e', iat: 1, exp: past })),
    undefined,
  );
  assert.equal(decodeClaims('not-a-token'), undefined);
});
