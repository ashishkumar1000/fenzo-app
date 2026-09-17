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
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../../config';
import { clearAuthToken, getAuthToken } from '../authToken';
import { DEADLINE_ABORTED, toApiError } from './apiError';

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
  // Repeat-style query arrays (`?status=a&status=b`): axios's default emits
  // bracket style (`?status[]=a`), which this backend's query parser (Fastify's
  // default) treats as a literal key and silently ignores — proven live
  // 2026-09-03. `indexes: null` is axios's built-in "arrays without brackets"
  // mode; it also drops null/undefined/empty-array params and serializes Date
  // values as ISO strings, so nothing needs to be hand-rolled here.
  paramsSerializer: { indexes: null },
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

// --- Per-request abort deadline ---------------------------------------------
// axios's `timeout` only sets `xhr.timeout`, and React Native's networking
// doesn't reliably honor it when a connection stalls after being accepted
// (observed live 2026-09-14: a PATCH hung far past API_TIMEOUT with no error —
// the Edit job sheet stayed locked on "Saving…"). An AbortController deadline
// is honored natively by the RN network stack, so every request gets one,
// combined with any caller-supplied signal (either source aborting cancels).
const requestTimers = new WeakMap<InternalAxiosRequestConfig, ReturnType<typeof setTimeout>>();

apiClient.interceptors.request.use(config => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    // Stamp the config BEFORE aborting: the rejection surfaces cancel-shaped
    // (ERR_CANCELED), and `toApiError` reads this stamp to classify it as
    // TIMEOUT — without it, abort-filtering callers (isAbort) would swallow a
    // real timeout as "the app's own cancel" and a loading screen would spin
    // forever with no error/Retry (JobDetailScreen's load does exactly that).
    (config as InternalAxiosRequestConfig & Record<string, unknown>)[DEADLINE_ABORTED] = true;
    // Self-clean at fire time: a rejection that reaches the response
    // interceptor without `error.config` (a request interceptor registered
    // after this one throwing) never runs `clearRequestTimer`, so the WeakMap
    // entry must not outlive its fired timer.
    requestTimers.delete(config);
    controller.abort();
  }, API_TIMEOUT);
  requestTimers.set(config, timer);

  const callerSignal = config.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    // axios's signal type also allows a bare `{aborted}` object with no
    // addEventListener — only subscribe when the real signal API is there.
    else if (typeof callerSignal.addEventListener === 'function') {
      callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  config.signal = controller.signal;
  return config;
});

/**
 * Stops a request's deadline timer once it has settled (response or error).
 * A rejection that arrives with no `config` at all (only reachable via a
 * downstream request interceptor throwing) has no handle to its timer — that
 * timer fires once at the deadline and aborts an already-detached controller,
 * a harmless no-op that self-cleans from the map at fire time.
 */
function clearRequestTimer(config: InternalAxiosRequestConfig | undefined) {
  const timer = config && requestTimers.get(config);
  if (timer) {
    clearTimeout(timer);
    requestTimers.delete(config);
  }
}

// --- Response interceptor: normalize every failure into ApiError -----------
// Ensures the forced-logout callback fires at most once per "session
// expiring" event, even if several requests were in flight and all come
// back 401 around the same time — without this, each would independently
// see `hadToken = true` (the token isn't cleared until the first one
// finishes) and all would fire `onUnauthorized`/`clearAuthToken` redundantly.
let handlingUnauthorized = false;

apiClient.interceptors.response.use(
  response => {
    clearRequestTimer(response.config);
    return response;
  },
  (error: AxiosError) => {
    clearRequestTimer(error.config);
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

