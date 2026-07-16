import { getToken } from './session';
import type {
  BootstrapResponse,
  Mutation,
  PullResponse,
  PushResponse,
  SessionResponse,
} from '../types/contract';

/**
 * The only place the till talks to the network. Every call carries the device
 * bearer token; the API lives at the same origin the PWA was served from
 * ({tenant}.wivae.test), so there's no CORS and no base-URL guessing.
 *
 * Errors are classified so callers can react correctly: an OfflineError means
 * "try again later, nothing is wrong" (the outbox will retry), while an
 * ApiError with status 401 means the token is dead and the device must re-pair.
 */

export class OfflineError extends Error {
  constructor() {
    super('offline');
    this.name = 'OfflineError';
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`api_error_${status}`);
    this.name = 'ApiError';
  }
}

function baseUrl(): string {
  // Same origin as the served PWA. Overridable for split-origin dev if needed.
  return window.location.origin;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new ApiError(401, { message: 'No device token.' });
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch rejects only on network failure — treat as offline, not an error.
    throw new OfflineError();
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }

  return payload as T;
}

export const api = {
  session: () => request<SessionResponse>('GET', '/pos/session'),

  bootstrap: () => request<BootstrapResponse>('GET', '/sync/bootstrap'),

  pull: (since: string) =>
    request<PullResponse>('GET', `/sync/pull?since=${encodeURIComponent(since)}`),

  push: (mutations: Mutation[]) => request<PushResponse>('POST', '/sync/push', { mutations }),
};
