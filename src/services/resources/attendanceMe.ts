/**
 * services/resources/attendanceMe.ts
 * ───────────────────────────────────
 * The technician's own attendance surfaces (Story 15-10 UI over the live
 * 15-7 routes + the 15-10 summary route — contract source: fenzit-be
 * `docs/api-contracts.md` → "Attendance me").
 *
 * A plain function object on the shared `apiClient` (same shape as
 * `attendanceSetup.ts`). Technician-only: an owner JWT gets 403 (the owner
 * tree never calls these). Rejects with `ApiError` on failure.
 *
 * This module OWNS the `AttendanceAccessState` union — the single source
 * of the four AD-17 states for the whole app. `users.ts` (the /users/me
 * mirror) and the feature-level access store both import it from here, so
 * nothing imports types from `features/` (spec-15-10 review finding #10).
 *
 * Documented failures (each named for the surface that branches on it):
 *   - GET me/access — 200 with the view row; 401; 403 (non-technician);
 *     500 if the view read fails (fail-loud, never a fabricated state).
 *   - POST me/onboarding — 200 `{ onboardedAt }`; replays answer the
 *     ORIGINAL first-write timestamp, so a double-tap or a reinstall is
 *     accepted, never an error.
 *   - GET me/summary — 200 for every access state, but only
 *     `active`/`upcoming` carry data: `none`/`history_only` answer an
 *     honest empty payload (the app never calls it in those states).
 *     Times travel as `HH:mm` — 12-hour rendering is the app's job.
 */
import { apiClient } from '../api/apiClient';

/** The four AD-17 access states — the app's entry-point vocabulary. */
export type AttendanceAccessState =
  | 'none'
  | 'upcoming'
  | 'active'
  | 'history_only';

const ACCESS_STATES: AttendanceAccessState[] = [
  'none',
  'upcoming',
  'active',
  'history_only',
];

/**
 * `GET /attendance/me/access` — the entry-point gate (FR-3). Field
 * semantics are the server's (the view anchors the office at TODAY for
 * active employees, at the next period's start for upcoming); the app only
 * displays what this carries and never re-derives state from dates.
 */
export interface AttendanceAccess {
  attendanceEnabled: boolean;
  attendanceAccess: AttendanceAccessState;
  /** `YYYY-MM-DD` tenant-local; the upcoming state's start date. */
  attendanceStartDate: string | null;
  enabledAt: string | null;
  onboardedAt: string | null;
  officeId: string | null;
  officeName: string | null;
}

/**
 * `GET /attendance/me/summary` — the FR-4 summary (office, timings, late
 * cut-off, weekly offs) for `active`/`upcoming`; honestly empty otherwise.
 */
export interface AttendanceSummary {
  officeId: string | null;
  officeName: string | null;
  /** `HH:mm` (wire convention; the app renders 12-hour). */
  startTime: string | null;
  endTime: string | null;
  lateCutOffMinutes: number | null;
  /** ISO weekday numbers 1=Mon..7=Sun, sorted; [] = no weekly offs. */
  weeklyOffDays: number[];
}

/** Defensive unwrap: a malformed access body degrades to `none`, never a
 *  crash — the tab then renders hidden and the next refresh corrects it. */
function normalizeAccess(raw: Partial<AttendanceAccess> | null | undefined): AttendanceAccess {
  return {
    attendanceEnabled: raw?.attendanceEnabled === true,
    attendanceAccess: ACCESS_STATES.includes(raw?.attendanceAccess as AttendanceAccessState)
      ? (raw?.attendanceAccess as AttendanceAccessState)
      : 'none',
    attendanceStartDate: typeof raw?.attendanceStartDate === 'string' ? raw.attendanceStartDate : null,
    enabledAt: typeof raw?.enabledAt === 'string' ? raw.enabledAt : null,
    onboardedAt: typeof raw?.onboardedAt === 'string' ? raw.onboardedAt : null,
    officeId: typeof raw?.officeId === 'string' ? raw.officeId : null,
    officeName: typeof raw?.officeName === 'string' ? raw.officeName : null,
  };
}

/** Defensive unwrap for the summary — nulls stay nulls, days must be numbers. */
function normalizeSummary(raw: Partial<AttendanceSummary> | null | undefined): AttendanceSummary {
  return {
    officeId: typeof raw?.officeId === 'string' ? raw.officeId : null,
    officeName: typeof raw?.officeName === 'string' ? raw.officeName : null,
    startTime: typeof raw?.startTime === 'string' ? raw.startTime : null,
    endTime: typeof raw?.endTime === 'string' ? raw.endTime : null,
    lateCutOffMinutes:
      typeof raw?.lateCutOffMinutes === 'number' && Number.isFinite(raw.lateCutOffMinutes)
        ? raw.lateCutOffMinutes
        : null,
    weeklyOffDays: Array.isArray(raw?.weeklyOffDays)
      ? raw.weeklyOffDays.filter((d): d is number => typeof d === 'number').sort((a, b) => a - b)
      : [],
  };
}

/** `GET /attendance/me/access` — the AD-17 entry-point gate. */
async function getAccess(): Promise<AttendanceAccess> {
  const res = await apiClient.get<AttendanceAccess>('/attendance/me/access');
  return normalizeAccess(res.data);
}

/**
 * `POST /attendance/me/onboarding` — record FR-4 completion (first write
 * wins; replays answer the original timestamp). Allowed in any access
 * state — the server records; the UI gates the intro.
 */
async function recordOnboarding(): Promise<{ onboardedAt: string | null }> {
  const res = await apiClient.post<{ onboardedAt: string | null }>(
    '/attendance/me/onboarding',
  );
  return {
    onboardedAt: typeof res.data?.onboardedAt === 'string' ? res.data.onboardedAt : null,
  };
}

/** `GET /attendance/me/summary` — the FR-4 summary (active/upcoming only). */
async function getSummary(): Promise<AttendanceSummary> {
  const res = await apiClient.get<AttendanceSummary>('/attendance/me/summary');
  return normalizeSummary(res.data);
}

export const attendanceMeService = {
  getAccess,
  recordOnboarding,
  getSummary,
};
