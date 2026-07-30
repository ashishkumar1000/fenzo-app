/**
 * authToken.ts
 * ────────────
 * Auth token storage — the single place `apiClient` (request interceptor)
 * and the auth flow both read/write the session token. Backed by the same
 * MMKV instance as everything else (`storage.ts`), so reads are synchronous
 * and the token persists across app restarts.
 *
 * INTEGRATION POINT: once login issues a real token, call `setAuthToken`
 * from `useAuth`'s `complete()` (or wherever the login response lands).
 * On logout / a 401 from the backend, `clearAuthToken` is called
 * automatically by `apiClient`'s response interceptor — no manual wiring
 * needed there.
 */
import { storage } from './storage';

const KEY = 'fenzit.authToken';

/** Returns the stored session token, or `null` if the user isn't logged in. */
export function getAuthToken(): string | null {
  const token = storage.getString(KEY);
  // Treat an empty string the same as "not set" — avoids an ambiguous state
  // where `setAuthToken('')` leaves a value in storage that reads as
  // truthy-but-empty. `apiClient`'s `if (token)` check would already skip
  // attaching an empty header, so normalizing here keeps every caller
  // consistent instead of just the one that happens to falsy-check it.
  return token && token.length > 0 ? token : null;
}

/** Persists the session token after a successful login. */
export function setAuthToken(token: string): void {
  if (!token) {
    throw new Error('setAuthToken: token must be a non-empty string. Use clearAuthToken() to log out.');
  }
  storage.set(KEY, token);
}


/** Clears the session token — call on logout, or let a 401 response do it automatically. */
export function clearAuthToken(): void {
  storage.remove(KEY);
}

