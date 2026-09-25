/**
 * App configuration and environment setup.
 *
 * Kept as plain constants (no env-file library) since we only need a
 * dev/prod switch today. If per-environment builds (staging, multiple
 * API keys, etc.) become necessary, swap this for `react-native-config`
 * without touching any call site — everything imports from here.
 */

/**
 * API server coordinates, split into origin and versioned path prefix.
 *
 * The path prefix matches `setGlobalPrefix('api/v1')` in fenzit-be's
 * main.ts; the Cloudflare worker fronting api.fenzit.com
 * (`fenzit-api-proxy`) forwards `/api/v1/*` transparently to Render with the
 * path unchanged.
 *
 * `API_BASE_URL` is what apiClient and the resource services consume. The
 * pieces are kept separate so other consumers (e.g. a websocket or a
 * media/asset URL builder) can reuse the origin without re-hardcoding it.
 */
export const API_HOST = 'https://api.fenzit.com';
//export const API_HOST = 'http://192.168.1.218:3000';
export const API_VERSION_PREFIX = '/api/v1';
export const API_BASE_URL = `${API_HOST}${API_VERSION_PREFIX}`;

/** Default request timeout, in milliseconds. */
export const API_TIMEOUT = 15000;

/**
 * Supabase project coordinates (Story 3.3 — Realtime as a refetch hint).
 *
 * The publishable key is public by design (same class as API_BASE_URL) —
 * it scopes the client to the project; authorization happens server-side
 * via RLS. The service_role key never leaves fenzit-be — do not add it here.
 * Used only by `src/services/supabaseRealtime.ts` for the Realtime socket;
 * all REST traffic keeps going through `API_BASE_URL` / apiClient.
 */
export const SUPABASE_URL = 'https://pnlvreaijzslfymlnoti.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_PysMKIKlQIul6KyAh8-58w_ArsfVh3L';

