import { HttpError } from '../../core/errors';

/** Call inside the es() callback so failures are recorded before its span ends. */
export function completeSearch<T extends { timed_out?: boolean; _shards?: { failed: number } }>(
  result: T,
): T {
  if (result.timed_out || (result._shards?.failed ?? 0) > 0) {
    throw new HttpError(503, 'search_incomplete', 'Search backend returned incomplete results');
  }
  return result;
}
