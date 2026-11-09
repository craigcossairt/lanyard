// Typed API client. Every call sends the active token as `Authorization: Bearer`.
//   const view = await api.get<EventView>(`/events/${id}`);
//   const res = await api.post<JoinResponse>(`/events/${id}/join`, { joinCode });
import type {
  EventView,
  JoinRequest,
  JoinResponse,
  RoleLinkRequest,
  RoleLinkResponse,
  RuntimeConfig,
} from '@lanyard/contracts';
import { getSession } from './auth';

/**
 * What a person sees for a failed call. Server messages are for developers ("WORKER_URL is not
 * set"), so `message` is always one of these sentences; the server's text stays in `detail`.
 */
export function friendlyMessage(status: number, code: string): string {
  if (code === 'bad_join_code') return 'That join code doesn’t match this event.';
  if (status === 401) return 'Your link has expired. Open it again, or rejoin the event.';
  if (status === 403) return 'Your link doesn’t give access to that.';
  if (status === 404) return 'We couldn’t find that. It may have moved or ended.';
  if (status === 400 || status === 422) return 'That didn’t look right. Check it and try again.';
  if (status === 429) return 'Lots of people are doing that right now. Try again in a moment.';
  if (status >= 500) return 'That isn’t available right now. Try again in a moment.';
  return 'Something went wrong. Try again.';
}

export class ApiError extends Error {
  /** The server's own message, for logs and debugging. Never show it to people. */
  public readonly detail: string;
  constructor(
    public readonly status: number,
    public readonly code: string,
    detail: string,
  ) {
    super(friendlyMessage(status, code));
    this.detail = detail;
  }
}

export function authHeaders(): Record<string, string> {
  const s = getSession();
  return s ? { authorization: `Bearer ${s.token}` } : {};
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 10_000,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...authHeaders(),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // A gateway or proxy error page (HTML), not our API: fall through to the status code.
    if (res.ok) throw new ApiError(502, 'bad_response', 'Response was not JSON');
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? res.statusText);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),

  // WS0 routes
  config: () => request<RuntimeConfig>('GET', '/config'),
  event: (eventId: string) => request<EventView>('GET', `/events/${encodeURIComponent(eventId)}`),
  join: (eventId: string, body: JoinRequest = {}) =>
    request<JoinResponse>('POST', `/events/${encodeURIComponent(eventId)}/join`, body),
  roleLinks: (eventId: string, body: RoleLinkRequest) =>
    request<RoleLinkResponse>('POST', `/events/${encodeURIComponent(eventId)}/role-links`, body),
};
