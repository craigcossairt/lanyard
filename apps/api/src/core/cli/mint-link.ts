// Bootstrap CLI: mint a role link locally, signed with TOKEN_SIGNING_KEY.
//   npm run mint-link -- --role organizer --event cnh-demos [--ttl-hours 24] [--env-file path] [--base-url url]
// Loads ./.env if present (or --env-file). Prints only the link; never prints the key.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Role } from '@lanyard/contracts';
import { joinLink, newId, signToken } from '../tokens';

const { values } = parseArgs({
  options: {
    role: { type: 'string', default: 'organizer' },
    event: { type: 'string' },
    'ttl-hours': { type: 'string', default: '24' },
    'env-file': { type: 'string' },
    'base-url': { type: 'string' },
  },
});

const envFile = values['env-file'] ?? (existsSync('.env') ? '.env' : undefined);
if (envFile) process.loadEnvFile(envFile);

const role = Role.safeParse(values.role);
const key = process.env.TOKEN_SIGNING_KEY;
if (!role.success || !values.event || !key) {
  console.error(
    'usage: npm run mint-link -- --role <organizer|speaker|vendor|venue> --event <eventId> [--env-file path]\n' +
      '(TOKEN_SIGNING_KEY must be set in env or the env file)',
  );
  process.exit(2);
}

const base = values['base-url'] ?? process.env.PUBLIC_BASE_URL ?? 'https://lanyard.cnh.radarhq.io';
const ttl = Number(values['ttl-hours']) * 3600;
const { token, claims } = signToken(
  key,
  { sub: newId(role.data), role: role.data, eventId: values.event },
  ttl,
);
console.log(joinLink(base, token));
console.error(
  `role=${claims.role} event=${claims.eventId} expires=${new Date(claims.exp * 1000).toISOString()}`,
);
