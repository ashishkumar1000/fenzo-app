// App-wide constants
// Export API endpoints, error messages, fixed values here

/**
 * Focus-refresh throttle window (milliseconds).
 *
 * A shared-store load whose last SUCCESS was within this window is skipped,
 * so rapid tab switches cost at most one request per window. `force: true`
 * (pull-to-refresh, post-mutation refreshes) always bypasses it.
 *
 * Stories 2.2/3.1 reuse this same window for their own focus refreshes —
 * keep the literal in one place.
 */
export const FOCUS_REFRESH_TTL_MS = 15_000;
