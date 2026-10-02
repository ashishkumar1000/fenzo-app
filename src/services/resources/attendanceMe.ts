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
  /** The last tracked day, `YYYY-MM-DD` (19-6) — the "tracking ended on"
   *  note's {date}. history_only-ONLY by the view's CASE gate: null in
   *  every other state, and null (an older BE) degrades to the dateless
   *  note. Never gate on this alone — `attendanceAccess` decides state. */
  attendanceEndedOn: string | null;
  enabledAt: string | null;
  onboardedAt: string | null;
  officeId: string | null;
  officeName: string | null;
}

/**
 * `GET /attendance/me/summary` — the FR-4 summary (office, timings, late
 * cut-off, weekly offs) for `active`/`upcoming`; honestly empty otherwise.
 * 16-4 adds the Today extension: office pin, today's day facts and today's
 * record — `today`/`todayRecord` exist ONLY for active employees (null
 * otherwise); `todayRecord` is null until the first check-in. Instants
 * carry the tenant offset — format wall-clock parts, never convert.
 */
export interface AttendanceTodayFacts {
  /** `YYYY-MM-DD` tenant-local (the server's today — never the device's). */
  date: string;
  isWeeklyOff: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  isWorkingDay: boolean;
  /** Today's ACTIVE leave state (17-8 D1 — day-context's own names):
   *  `pending` | `approved`, or null when no live leave covers today (a
   *  cancelled/revoked day reads null too). The summary read does NOT
   *  filter on working-day, so an off-day inside a leave span carries
   *  leaveState non-null with isWorkingDay false — exactly the shape the
   *  FE predicate must handle (the BE gate already does). The normalizer
   *  maps an ABSENT field (a pre-17-8 backend) to null: legacy payloads
   *  never ask. */
  leaveState: 'pending' | 'approved' | null;
  /** The covering request's part; null with leaveState. */
  leavePart: 'full_day' | 'first_half' | 'second_half' | null;
}

export interface AttendanceTodayRecord {
  checkinAt: string;
  checkoutAt: string | null;
  lateMinutes: number | null;
  isLate: boolean;
  workedMinutes: number | null;
  earlyCheckout: boolean | null;
  earlyCheckoutMinutes: number | null;
}

export interface AttendanceSummary {
  officeId: string | null;
  officeName: string | null;
  /** `HH:mm` (wire convention; the app renders 12-hour). */
  startTime: string | null;
  endTime: string | null;
  lateCutOffMinutes: number | null;
  /** ISO weekday numbers 1=Mon..7=Sun, sorted; [] = no weekly offs. */
  weeklyOffDays: number[];
  /** Office pin (display-only distance hint input; null when no office). */
  officeLatitude: number | null;
  officeLongitude: number | null;
  /** The office's geofence radius in metres — the SAME value the check-in/
   *  out gates read server-side. Prescreen/display input ONLY: the server
   *  stays authoritative for every punch, so a client lock must never
   *  reject on its own. null (no office, a radiusless column, or a field
   *  ABSENT on the wire — a pre-20-3 backend) means "never locked". */
  officeRadius: number | null;
  /** Active only; null otherwise (upcoming's anchor is a future date).
   *  `undefined` = the field was ABSENT on the wire (a pre-16-4 backend) —
   *  the Today screen's legacy-mode signal, never treated as facts. */
  today?: AttendanceTodayFacts | null;
  /** Active only; null when no record yet today. Undefined = absent on the
   *  wire (pre-16-4 backend). */
  todayRecord?: AttendanceTodayRecord | null;
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
    // Absent on the wire (a pre-19-6 BE) degrades to null — the dateless
    // ended-note posture, never an undefined leak into the feature layer.
    attendanceEndedOn: typeof raw?.attendanceEndedOn === 'string' ? raw.attendanceEndedOn : null,
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
    // 16-4 Today extension — defensively absent (a not-yet-deployed backend)
    // means "unknown", NOT "facts say working day": undefined keeps the
    // legacy-mode distinction the Today screen's gate relies on.
    officeLatitude:
      typeof raw?.officeLatitude === 'number' && Number.isFinite(raw.officeLatitude)
        ? raw.officeLatitude
        : null,
    officeLongitude:
      typeof raw?.officeLongitude === 'number' && Number.isFinite(raw.officeLongitude)
        ? raw.officeLongitude
        : null,
    // Defensively absent (a pre-20-3 backend) means "never locked" — the
    // summary is never rejected over the punch prescreen input.
    officeRadius:
      typeof raw?.officeRadius === 'number' && Number.isFinite(raw.officeRadius)
        ? raw.officeRadius
        : null,
    today: raw?.today === undefined ? undefined : normalizeTodayFacts(raw.today),
    todayRecord:
      raw?.todayRecord === undefined ? undefined : normalizeTodayRecord(raw.todayRecord),
  };
}

function normalizeTodayFacts(
  raw: Partial<AttendanceTodayFacts> | null,
): AttendanceTodayFacts | null {
  if (!raw || typeof raw.date !== 'string') return null;
  return {
    date: raw.date,
    isWeeklyOff: raw.isWeeklyOff === true,
    isHoliday: raw.isHoliday === true,
    holidayName: typeof raw.holidayName === 'string' ? raw.holidayName : null,
    isWorkingDay: raw.isWorkingDay === true,
    // 17-8 — STRICT WHITELIST: these MUST be listed here or the fields
    // vanish silently. Absent on the wire (a pre-17-8 backend) means
    // "legacy": both normalize to null, so no leave dialog is ever asked
    // from facts the device cannot know. An out-of-domain value (a future
    // state word) degrades to null too — dialog-less, and the server's
    // gate + the 409 fallback remain the safety net.
    leaveState:
      raw.leaveState === 'pending' || raw.leaveState === 'approved'
        ? raw.leaveState
        : null,
    leavePart:
      raw.leavePart === 'full_day' ||
      raw.leavePart === 'first_half' ||
      raw.leavePart === 'second_half'
        ? raw.leavePart
        : null,
  };
}

function normalizeTodayRecord(
  raw: Partial<AttendanceTodayRecord> | null,
): AttendanceTodayRecord | null {
  if (!raw || typeof raw.checkinAt !== 'string') return null;
  return {
    checkinAt: raw.checkinAt,
    checkoutAt: typeof raw.checkoutAt === 'string' ? raw.checkoutAt : null,
    lateMinutes:
      typeof raw.lateMinutes === 'number' && Number.isFinite(raw.lateMinutes)
        ? raw.lateMinutes
        : null,
    isLate: raw.isLate === true,
    workedMinutes:
      typeof raw.workedMinutes === 'number' && Number.isFinite(raw.workedMinutes)
        ? raw.workedMinutes
        : null,
    earlyCheckout: typeof raw.earlyCheckout === 'boolean' ? raw.earlyCheckout : null,
    earlyCheckoutMinutes:
      typeof raw.earlyCheckoutMinutes === 'number' &&
      Number.isFinite(raw.earlyCheckoutMinutes)
        ? raw.earlyCheckoutMinutes
        : null,
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
