// Job registry: one import + one array entry per job folder (keep sorted).
// See docs/plan/HOWTO-modules.md. Each folder: jobs/<name>/index.ts, default export defineJob().
import type { JobDef } from '../../../api/src/core/jobs';
import catchup from './catchup';
import cluster from './cluster';
import ping from './ping';
import translate from './translate';

export const jobs: JobDef[] = [
  catchup as JobDef,
  cluster as JobDef,
  ping as JobDef,
  translate as JobDef,
];
