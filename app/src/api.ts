import type { Credentials } from './credentials';
import { FETCH_TIMEOUT_MS } from './config';

export type OutgoingPoint = {
  recorded_at: number;
  lat: number;
  lon: number;
  accuracy?: number | null;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  battery?: number | null;
  source?: 'background' | 'foreground';
};

export type LocationPoint = Required<OutgoingPoint> & { received_at: number };

export type UserStatus = {
  name: string;
  sharing_enabled: boolean;
  sharing_changed_at: number | null;
  latest: LocationPoint | null;
};

export type StatusResponse = { me: string; users: UserStatus[] };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  creds: Credentials,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(creds.url + path, {
      method,
      headers: {
        Authorization: `Bearer ${creds.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        // non-JSON error body
      }
      throw new ApiError(res.status, msg);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  status: (c: Credentials) => request<StatusResponse>(c, 'GET', '/api/status'),
  postLocations: (c: Credentials, points: OutgoingPoint[]) =>
    request<{ inserted: number; received: number }>(c, 'POST', '/api/locations', { points }),
  setSharing: (c: Credentials, enabled: boolean) =>
    request<UserStatus>(c, 'PUT', '/api/sharing', { enabled }),
};
