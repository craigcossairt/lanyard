// The shared time helper. Store and send UTC ISO-8601; render ONLY through these
// functions, in the event's IANA timezone (default America/Denver).
export const DEFAULT_EVENT_TZ = 'America/Denver';

export const nowIso = (): string => new Date().toISOString();

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

/** "2:30 PM" in the event timezone. */
export function formatTime(iso: string, tz: string = DEFAULT_EVENT_TZ): string {
  return fmt(tz, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** "Mon, Nov 9" in the event timezone. */
export function formatDay(iso: string, tz: string = DEFAULT_EVENT_TZ): string {
  return fmt(tz, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));
}

/** "2:30 – 3:05 PM" in the event timezone. */
export function formatRange(
  startIso: string,
  endIso: string,
  tz: string = DEFAULT_EVENT_TZ,
): string {
  return fmt(tz, { hour: 'numeric', minute: '2-digit' }).formatRange(
    new Date(startIso),
    new Date(endIso),
  );
}

/** YYYY-MM-DD of the instant in the event timezone (for grouping a schedule by day). */
export function eventDate(iso: string, tz: string = DEFAULT_EVENT_TZ): string {
  const parts = fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(iso),
  );
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** True when `at` falls in [startsAt, endsAt). */
export function isBetween(at: Date | string, startsAt: string, endsAt: string): boolean {
  const t = new Date(at).getTime();
  return t >= Date.parse(startsAt) && t < Date.parse(endsAt);
}

/** Minutes from `from` until `iso` (negative if past). */
export function minutesUntil(iso: string, from: Date = new Date()): number {
  return Math.round((Date.parse(iso) - from.getTime()) / 60_000);
}
