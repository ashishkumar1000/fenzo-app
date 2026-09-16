/**
 * App configuration and environment setup.
 *
 * Kept as plain constants (no env-file library) since we only need a
 * dev/prod switch today. If per-environment builds (staging, multiple
 * API keys, etc.) become necessary, swap this for `react-native-config`
 * without touching any call site — everything imports from here.
 */

/**
 * Base URLs for the Fenzit backend (NestJS).
 *
 * Prod and local share the SAME path shape — `…/api/v1` — on purpose:
 * `setGlobalPrefix('api/v1')` in fenzit-be's main.ts, and the Cloudflare
 * worker fronting api.fenzit.com (`fenzit-api-proxy`) forwards `/api/v1/*`
 * transparently to Render with the path unchanged. Which endpoint is ACTIVE
 * is decided at runtime, from Settings — see `src/services/apiEndpoint.ts`
 * (it picks between these constants and applies the choice to `apiClient`
 * per request). This file only owns the constants.
 *
 * Both defaults are overridable per build without editing (Metro inlines
 * process.env at bundle time):
 *   `API_BASE_URL=<url> bun run android:standalone`  (prod)
 *   `DEV_API_URL=<url> bun run android:standalone`   (local default)
 * The local URL is also editable at runtime on the Settings screen.
 */
export const PROD_API_URL = process.env.API_BASE_URL ?? 'https://api.fenzit.com/api/v1';
export const DEFAULT_LOCAL_API_URL =
  process.env.DEV_API_URL ?? 'http://192.168.1.218:3000/api/v1';

/** Production base URL — the app's default endpoint (kept for call sites
 * and tests that want the "normal" URL without engaging the runtime switch). */
export const API_BASE_URL = PROD_API_URL;

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

