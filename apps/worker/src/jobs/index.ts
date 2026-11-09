// Job registry: one import + one array entry per job folder (keep sorted).
// See docs/plan/HOWTO-modules.md. Each folder: jobs/<name>/index.ts, default export defineJob().
import type { JobDef } from '../../../api/src/core/jobs';
import ping from './ping';
import cluster from './cluster';

export const jobs: JobDef[] = [cluster as JobDef, ping as JobDef];
