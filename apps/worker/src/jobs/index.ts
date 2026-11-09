// Job registry: one import + one array entry per job folder (keep sorted).
// See docs/plan/HOWTO-modules.md. Each folder: jobs/<name>/index.ts, default export defineJob().
import type { JobDef } from '../../../api/src/core/jobs';
import catchup from './catchup';
import ping from './ping';

export const jobs: JobDef[] = [catchup as JobDef, ping as JobDef];
