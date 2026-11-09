// Local dev only: load a .env file into process.env before anything reads config.
// Order: $ENV_FILE, ./.env, ../../.env (repo root when run from apps/*). Existing env
// vars always win. Skipped in production, where env comes from the app-credentials Secret.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

if (process.env.NODE_ENV !== 'production') {
  const candidates = [process.env.ENV_FILE, '.env', path.join('..', '..', '.env')];
  const file = candidates.find((p): p is string => Boolean(p) && existsSync(p as string));
  if (file) {
    for (const [k, v] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
      if (process.env[k] === undefined && v !== undefined) process.env[k] = v;
    }
  }
}
