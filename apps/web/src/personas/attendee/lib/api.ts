// TEMP adapter (WS3). The WS0 shell (`apps/web/src/app/`) owns the real typed API
// client; when it lands, this file becomes a re-export of it and nothing else changes.
// Rules kept here: Bearer token from storage, never in a URL; JSON errors as ApiError.
import type { ApiError as ApiErrorBody } from '@lanyard/contracts';
import { isMock, mockRequest } from './mock';

export const TOKEN_KEY = 'lanyard.token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private mode: the token lives in memory for this visit only.
  }
}

export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Every outbound call has an explicit timeout (API routes never block past 8 s). */
const REQUEST_TIMEOUT_MS = 10_000;

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  if (isMock()) return mockRequest<T>(method, path, body);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...authHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const timedOut =
      err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new ApiError(
      0,
      timedOut ? 'timeout' : 'network',
      timedOut
        ? 'The request took too long. Check your connection and try again.'
        : 'Could not reach the server.',
    );
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }
  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? res.statusText);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
};
