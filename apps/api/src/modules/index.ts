// Module registry: one import + one array entry per workstream module.
// Keep the list sorted to avoid merge conflicts; see docs/plan/HOWTO-modules.md.
import type { LanyardModule } from '../core/module';
import ops from './ops';
import search from './search';

export const modules: LanyardModule[] = [ops, search];
