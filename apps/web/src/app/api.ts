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

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
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
  const data: unknown = text ? JSON.parse(text) : undefined;
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
