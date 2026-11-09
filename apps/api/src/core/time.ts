// Time helper for the API. Storage and transit are UTC ISO-8601; anything rendered for a
// human (LLM prompts, digests) goes through the event-timezone formatters from contracts.
export {
  DEFAULT_EVENT_TZ,
  eventDate,
  formatDay,
  formatRange,
  formatTime,
  isBetween,
  minutesUntil,
  nowIso,
} from '@lanyard/contracts';

/** ISO string for `minutes` ago (UTC), e.g. for "last N minutes" range queries. */
export const minutesAgoIso = (minutes: number, from: Date = new Date()): string =>
  new Date(from.getTime() - minutes * 60_000).toISOString();

/** Floor a time to a window start (e.g. 60 s signal windows), as UTC ISO. */
export const windowStartIso = (windowSec: number, at: Date = new Date()): string =>
  new Date(Math.floor(at.getTime() / (windowSec * 1000)) * windowSec * 1000).toISOString();
