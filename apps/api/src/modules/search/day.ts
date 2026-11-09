import { eventDate } from '@lanyard/contracts';
import { HttpError } from '../../core/errors';

/** Find real UTC boundaries through IANA date conversion, including DST changes. */
export function localDayWindow(date: string, timezone: string): { from: string; to: string } {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(midnight) ||
    new Date(midnight).toISOString().slice(0, 10) !== date
  ) {
    throw new HttpError(400, 'invalid_date', 'date must be a valid YYYY-MM-DD');
  }
  const boundary = (day: string, utc: number) => {
    let low = utc - 36 * 3600_000;
    let high = utc + 36 * 3600_000;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (eventDate(new Date(mid).toISOString(), timezone) < day) low = mid;
      else high = mid;
    }
    return new Date(high).toISOString();
  };
  const next = new Date(midnight + 24 * 3600_000).toISOString().slice(0, 10);
  const from = boundary(date, midnight);
  const to = boundary(next, midnight + 24 * 3600_000);
  if (from === to)
    throw new HttpError(400, 'invalid_date', 'date does not occur in the event timezone');
  return { from, to };
}
