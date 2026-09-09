/**
 * realtimeToken.ts — Supabase Realtime token exchange (Story 3.3).
 *
 * The login JWT is rejected by Supabase Realtime (it never expires and its
 * `role: 'owner' | 'technician'` claim is not an existing Postgres role —
 * Story 3.1's spike), so the app exchanges it for a short-lived realtime
 * token: `GET /auth/realtime-token` mints `{ sub, role: 'authenticated',
 * exp }` with the same signing secret.
 *
 * The exchange is cached in module state and refreshed when the cached copy
 * is within `REFRESH_MARGIN_MS` of its `expiresAt` — roughly once an hour of
 * continuous foreground use. Nothing is persisted to MMKV: the token lives
 * for an hour, and a fresh login must never reuse the previous user's
 * token (the cache is cleared on the global 401 reset below).
 *
 * Failure contract (per the story spec): a failed fetch is silent — it just
 * means no socket this round; the app falls back to focus-refresh exactly
 * as it behaves without this story. The caller never sees the error.
 */
import { apiClient } from './api/apiClient';
import { getAuthToken } from './authToken';
import { registerReset } from './resetRegistry';

/** Exchange while still-valid, so the next subscriber never races an expiry. */
const REFRESH_MARGIN_MS = 60_000;

interface RealtimeTokenResponse {
  token: string;
  expiresAt: string;
}

let cached: { token: string; expiresAtMs: number } | null = null;
/**
 * In-flight exchange — the hook's `setupChannel` and supabase-js's
 * `accessToken` callback can both miss a cold/stale cache at the same
 * moment; sharing one promise keeps it to a single `/auth/realtime-token`
 * request (review fix, 2026-09-09).
 */
let pending: Promise<string | null> | null = null;

/**
 * Returns a current realtime token, or `null` when logged out or when the
 * exchange fails. Cheap when the cache is fresh — only expiry proximity (or
 * a cold cache) hits the network, and concurrent callers share one exchange.
 */
export function getRealtimeToken(): Promise<string | null> {
  if (!getAuthToken()) return Promise.resolve(null);

  if (cached && Date.now() < cached.expiresAtMs - REFRESH_MARGIN_MS) {
    return Promise.resolve(cached.token);
  }

  if (pending) return pending;

  pending = (async () => {
    try {
      const res = await apiClient.get<RealtimeTokenResponse>('/auth/realtime-token');
      const expiresAtMs = Date.parse(res.data.expiresAt);
      if (Number.isNaN(expiresAtMs)) {
        console.warn('[realtimeToken] /auth/realtime-token sent unparsable expiresAt');
        return null;
      }
      cached = { token: res.data.token, expiresAtMs };
      return cached.token;
    } catch (error) {
      // Logged, silent to the user — no socket is a graceful degradation.
      console.warn('[realtimeToken] token exchange failed →', error);
      return null;
    }
  })().finally(() => {
    pending = null;
  });

  return pending;
}

/** Drops the cached token — next call re-exchanges (e.g. after a user switch). */
export function clearRealtimeToken(): void {
  cached = null;
}

// Global 401 reset teardown — the login session ended, so any cached
// realtime token belongs to a user who is no longer signed in.
registerReset(clearRealtimeToken);
