import { createHash } from 'node:crypto';
import { HttpError } from '../../core/errors';
import type { llm } from '../../core/llm';

export type Generate = typeof llm;

const cache = new Map<string, { at: number; promise: Promise<unknown> }>();
let active = 0;

/** Shared, bounded cache; raw interests/questions never become keys or logs. */
export async function cachedGeneration<T>(
  purpose: string,
  input: unknown,
  generate: () => Promise<T>,
  deadline: number,
): Promise<T> {
  if (deadline <= Date.now())
    throw new HttpError(503, 'generation_pending', 'Please retry shortly');
  const key = createHash('sha256')
    .update(JSON.stringify([purpose, input]))
    .digest('hex');
  let hit = cache.get(key);
  if (hit && Date.now() - hit.at >= 60_000) {
    cache.delete(key);
    hit = undefined;
  }
  if (!hit) {
    if (active >= 4)
      throw new HttpError(503, 'generation_busy', 'Generation is busy; retry shortly');
    active++;
    const promise = Promise.resolve()
      .then(generate)
      .finally(() => active--);
    hit = { at: Date.now(), promise };
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, hit);
    promise.catch(() => {
      if (cache.get(key)?.promise === promise) cache.delete(key);
    });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      hit.promise as Promise<T>,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new HttpError(503, 'generation_pending', 'Generation is running; retry shortly'),
            ),
          Math.max(1, deadline - Date.now()),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
