import type { RegisterDeviceResponse } from '@amble/shared';
import { api, setAuthToken } from './client';
import { getToken, setToken } from '../lib/storage';

/**
 * Ensure this device has an anonymous identity. Reuses a stored token, or
 * registers a fresh device on first launch. Sets the token on the API client.
 */
export async function ensureDevice(): Promise<string> {
  let token = await getToken();
  if (!token) {
    const res = await api.post<RegisterDeviceResponse>('/devices');
    token = res.token;
    await setToken(token);
  }
  setAuthToken(token);
  return token;
}
