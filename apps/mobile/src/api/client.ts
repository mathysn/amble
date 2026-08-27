import Constants from 'expo-constants';

/**
 * Resolve the API base URL. In dev, reuse the Metro host so a physical device
 * on the same network reaches the machine running the API. Override with
 * EXPO_PUBLIC_API_URL when needed.
 */
function resolveBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:3000`;
}

export const API_BASE = resolveBaseUrl();

let authToken: string | null = null;
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Re-registers/reuses the device token. Set once from device.ts to avoid a circular import. */
let reauth: (() => Promise<string>) | null = null;
export function setReauthHandler(fn: () => Promise<string>): void {
  reauth = fn;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const hasBody = body !== undefined;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    // Self-heal: a missing/invalid token (e.g. bootstrap failed at launch, or
    // the in-memory token was lost to a dev-time reload) re-registers once
    // and retries, instead of leaving every call 401ing forever.
    if (res.status === 401 && !retried && reauth && path !== '/devices') {
      await reauth();
      return request<T>(method, path, body, true);
    }
    throw new ApiError(res.status, (data as { error?: string })?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
