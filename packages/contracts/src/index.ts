// Shared contracts. Source of truth: docs/plan/02-contracts.md. Change both together.
// Consumed as TypeScript source (no build step): Vite and tsup compile it into each app.
//
// Each zod schema shares its name with its inferred type:
//   import { Session, JoinResponse } from '@lanyard/contracts';
//   const s: Session = Session.parse(doc);
export * from './entities';
export * from './api';
export * from './realtime';
export * from './metrics';
export * from './time';
