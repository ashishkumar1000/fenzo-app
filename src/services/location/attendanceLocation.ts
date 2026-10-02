/**
 * attendanceLocation.ts — the attendance-only location capture (Story
 * 16-3, AD-20).
 *
 * Deliberately SEPARATE from the job flow's compat helper
 * (`features/technicianApp/geolocation.ts`): attendance needs `mocked` and
 * `provider` — fields only the MAIN nitro API returns — and the AC pins
 * attendance to its own function, never a shared one with parameters.
 * NFR-11: this runs only inside the check-in/out flow; no watcher, no
 * cached fixes, nothing stored.
 *
 * Failures are a CLOSED union the UI branches on — never a stringly error:
 * timeout / permission / unavailable / stale are each their own Today-
 * button message, because "no fix was ever obtained" (timeout) and "a fix
 * was obtained and rejected" (stale) are different employee problems.
 */
import { getCurrentPosition } from 'react-native-nitro-geolocation';

/** The AD-20 capture object — the check-in/out request body's location. */
export interface AttendanceLocationFix {
  latitude: number;
  longitude: number;
  accuracyM: number;
  /** null = not detected (the wire convention; the package's undefined
   *  maps to null so the JSON body never carries a missing field). */
  mocked: boolean | null;
  provider: string | null;
  /** Client-computed fix age; the DTO caps at 86 400 000 and the server
   *  re-judges staleness against 30 000. */
  fixAgeMs: number;
}

export type AttendanceLocationFailure =
  | 'timeout'      // code 3 — no fix was ever obtained (≠ low accuracy)
  | 'permission'   // code 1 — a residual denial after the probe
  | 'unavailable'  // code 2 (and Play-services/settings 4/5) — services off
  | 'stale'        // local pre-reject: the fix is older than the server's
                   // 30 s window — a doomed submission 422s with no attempt
                   // row and no employee-visible feedback, so we refuse it
                   // here instead
  | 'unknown';     // code −1 or anything unrecognized

/** The AD-20 request constants (spec 16-3): fresh, high-accuracy, 15 s. */
const CAPTURE_TIMEOUT_MS = 15_000;
/** The indoor fallback (user-directed, 2026-10-02): high accuracy holds out
 *  for GNSS samples that never arrive inside offices — desks saw every
 *  capture time out while Google Maps (which accepts WiFi-derived fixes)
 *  located instantly. When the first attempt TIMES OUT — and only then —
 *  one retry at balanced priority accepts the fix the provider can actually
 *  produce. maximumAge stays 0 on both attempts: still a fresh computation,
 *  and the server re-judges distance and staleness on every punch. */
const RETRY_TIMEOUT_MS = 25_000;
/** Server-side FIX_MAX_AGE_MS (16-1 constants) — mirrored for the local
 *  pre-reject so the employee sees "outdated location" instead of a
 *  generic server 422. */
const FIX_MAX_AGE_MS = 30_000;
/** The DTO's @Max — a larger computed age is a guaranteed 422. */
const FIX_AGE_MAX_MS = 86_400_000;

interface RawLocationError {
  code?: number;
  message?: string;
}

function classifyFailure(err: unknown): AttendanceLocationFailure {
  const raw = err as RawLocationError;
  switch (raw?.code) {
    case 1:
      return 'permission';
    case 2:
    case 4:
    case 5:
      return 'unavailable';
    case 3:
      return 'timeout';
    default:
      return 'unknown';
  }
}

/**
 * One fresh high-accuracy fix, mapped to the AD-20 shape. Rejects with the
 * failure-union string — callers own the user-facing copy per member.
 */
export async function captureAttendanceLocation(): Promise<AttendanceLocationFix> {
  let fix;
  try {
    fix = await getCurrentPosition({
      accuracy: { android: 'high', ios: 'best' },
      maximumAge: 0, // never a cached fix (AD-20)
      timeout: CAPTURE_TIMEOUT_MS,
    });
  } catch (err) {
    // Only a TIMEOUT earns the balanced retry: permission and
    // services-off failures are deterministic — the retry cannot succeed,
    // and the remediation copy depends on the exact failure.
    if (classifyFailure(err) !== 'timeout') {
      console.error('[attendanceLocation] capture failed:', err);
      throw classifyFailure(err);
    }
    try {
      fix = await getCurrentPosition({
        accuracy: { android: 'balanced', ios: 'best' },
        // Loosened by design (user-directed): the retry may hand back a fix
        // up to 15 s old — still inside the server's 30 s freshness gate,
        // and fixAgeMs travels so the server is the one who judges.
        maximumAge: 15_000,
        timeout: RETRY_TIMEOUT_MS,
      });
    } catch (retryErr) {
      console.error('[attendanceLocation] capture failed:', retryErr);
      throw classifyFailure(retryErr);
    }
  }

  const { latitude, longitude, accuracy } = fix.coords;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    typeof accuracy !== 'number'
  ) {
    throw 'unknown';
  }

  const fixAgeMs = Math.min(
    Math.max(0, Date.now() - fix.timestamp),
    FIX_AGE_MAX_MS,
  );
  if (fixAgeMs > FIX_MAX_AGE_MS) {
    throw 'stale';
  }

  return {
    latitude,
    longitude,
    accuracyM: accuracy,
    mocked: typeof fix.mocked === 'boolean' ? fix.mocked : null,
    provider: typeof fix.provider === 'string' ? fix.provider : null,
    fixAgeMs,
  };
}
