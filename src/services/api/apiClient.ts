/**
 * apiClient.ts
 * ────────────
 * The single axios instance for the whole app. Nothing outside `services/`
 * should import `axios` directly — go through `apiClient`, or better, through
 * `ApiService` (see ApiService.ts) so you get typed CRUD methods for free.
 *
 * Responsibilities (and nothing else — see apiError.ts for error shaping):
 *   1. Base URL + timeout, sourced from `src/config`.
 *   2. Request interceptor — attaches the bearer token, if one is stored.
 *   3. Response interceptor — hands every failure to `toApiError` so callers
 *      always receive the same `ApiError` shape, regardless of whether the
 *      failure was a network drop, a timeout, a cancellation, or a 4xx/5xx
 *      from the backend. Also decides *whether* a 401 should trigger a
 *      forced logout: only if a token was actually attached to the failed
 *      request — a 401 on a login attempt itself (no token yet) is just a
 *      wrong-credentials error, not a session expiring.
 *
 * Module layout for the whole `api/` folder:
 *   apiError.ts   → what an error looks like, and how to build one
 *   apiClient.ts  → this file: the configured axios instance (uses apiError.ts)
 *   ApiService.ts → generic per-resource CRUD class (built on this instance)
 */
import axios from 'axios';
import type { AxiosError } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../../config';
import { clearAuthToken, getAuthToken } from '../authToken';
import { toApiError } from './apiError';

export type { ApiError } from './apiError';

/**
 * Registers a callback to run whenever a request comes back `401
 * Unauthorized` — typically wired up once, near app start, to force a
 * logout/redirect-to-login. Pass `null` to unregister.
 *
 * Kept as a settable hook (rather than a hard import of the auth feature)
 * so `services/` never depends on `features/` — dependencies only flow
 * one way, from features down to services.
 *
 * @example
 *   // In App.tsx, once, on mount:
 *   setOnUnauthorized(() => authStore.reset());
 */
let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** The configured axios instance. Prefer `ApiService` over calling this directly. */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Request interceptor: attach auth token --------------------------------
apiClient.interceptors.request.use(config => {
  const token = getAuthToken();
  if (token) {
    // Guard rather than assume `config.headers` is already an object —
    // axios normally populates it, but a custom/edge config could omit it.
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Response interceptor: normalize every failure into ApiError -----------
// Ensures the forced-logout callback fires at most once per "session
// expiring" event, even if several requests were in flight and all come
// back 401 around the same time — without this, each would independently
// see `hadToken = true` (the token isn't cleared until the first one
// finishes) and all would fire `onUnauthorized`/`clearAuthToken` redundantly.
let handlingUnauthorized = false;

apiClient.interceptors.response.use(
  response => response,
  (error: AxiosError) => {
    // Only treat a 401 as "session expired" (and force a logout) if a token
    // was actually attached to this request. Without this check, a login
    // request itself returning 401 (wrong OTP/credentials — there was never
    // a token) would incorrectly trigger the app's logout flow while the
    // person is simply failing to log in.
    const hadToken = Boolean(getAuthToken());
    const apiError = toApiError(error, () => {
      if (hadToken && !handlingUnauthorized) {
        handlingUnauthorized = true;
        onUnauthorized?.();
        clearAuthToken();
        // Reset on next tick so a genuinely new session (fresh login) can
        // trigger this flow again later.
        setTimeout(() => {
          handlingUnauthorized = false;
        }, 0);
      }
    });
    return Promise.reject(apiError);
  },
);

