/**
 * services/resources/attendanceDayStatus.ts
 * ─────────────────────────────────────────
 * The FR-10 day-status range reads (Story 18-3 over the shipped 18-1/18-2
 * routes — contract source: fenzit-be `docs/api-contracts.md` →
 * "Day statuses & corrections"). Plain functions on the shared `apiClient`
 * (the attendanceLeave.ts shape).
 *
 *   fetchDayStatuses   GET /attendance/day-statuses   [owner]
 *   fetchMyDayStatuses GET /attendance/me/day-statuses [technician]
 *
 * Both envelopes echo `today` — the tenant-local date the read ran under.
 * Hosts feed the calendar's today ring from it and never derive a device
 * date (Foundation rule). Instants are tenant-offset ISO (AD-7): rendered
 * as carried, never converted.
 *
 * The normalizer is FAIL-CLOSED on the status word: ONE unknown status in
 * the range rejects the whole fetch (a month minus one silently-Not-tracked
 * row is exactly the misrepresentation this forbids). Unknown marker words
 * are filtered instead — a marker only drives a flag tag, so absence is an
 * honest degradation, not a misstate.
 *
 * Error surface: rejections are `ApiError`; the me paths' `403
 * ATTENDANCE_NOT_TRACKED` is the caller's ordinary error state (the access
 * UI is 19-6's concern). Range construction stays client-side small:
 * `monthRange` spans one calendar month — structurally under the wire's
 * 62-day cap (over-cap answers `422 ATTENDANCE_INVALID_RANGE` regardless).
 */
import { apiClient } from '../api/apiClient';

/** The closed BE enum (day-status-response.model.ts STATUS_KEYS). */
export type DayStatusKey =
  | 'not_tracked'
  | 'not_checked_in_yet'
  | 'in_progress'
  | 'weekly_off'
  | 'holiday'
  | 'worked_on_holiday'
  | 'leave'
  | 'half_day_leave'
  | 'present'
  | 'half_day'
  | 'absent'
  | 'checkout_missing';

/** The closed marker union (the flags the sheet renders). */
export type DayMarker =
  | 'corrected'
  | 'leave_pending'
  | 'checkout_missing'
  | 'fake_location_attempt';

export type AttendanceSource = 'gps' | 'manual' | null;

/** The audit value shape inside `latestCorrection` (any of the 12 keys —
 *  a seeded old_value carries the day's FR-10 grade). */
export interface CorrectionValue {
  status: DayStatusKey | null;
  checkinAt: string | null;
  checkoutAt: string | null;
}

/** The newest entry of the day's audit chain — ABSENT on uncorrected days
 *  (never null; the sheet keys off the absence). */
export interface LatestCorrectionView {
  correctedAt: string;
  actorName: string | null;
  note: string;
  oldValue: CorrectionValue;
  newValue: CorrectionValue;
}

/** One employee-day of the FR-10 grid — byte-parity with the contract. */
export interface DayStatusRow {
  workDate: string;
  status: DayStatusKey;
  lateMinutes: number | null;
  isLate: boolean;
  earlyCheckoutMinutes: number | null;
  earlyCheckout: boolean;
  workedMinutes: number | null;
  /** FR-11 credits — decimal, summing over any range (Epic 19 reads them). */
  daysWorked: number;
  leaveCredit: number;
  workedOnHolidayCredit: number;
  isWeeklyOff: boolean;
  holidayName: string | null;
  isWorkingDay: boolean;
  officeId: string | null;
  officeName: string | null;
  /** AD-7 tenant-offset ISO — the effective instants (a times-only
   *  override's instants replace the record's). */
  checkinAt: string | null;
  checkoutAt: string | null;
  checkinSource: AttendanceSource;
  checkoutSource: AttendanceSource;
  /** GPS-measured distance from the office pin (metres) — null for a
   *  manual source or a day with no record (spec-18-3 D2: a times-only
   *  correction keeps the ORIGINAL GPS fix unpaired). */
  checkinDistanceM: number | null;
  checkoutDistanceM: number | null;
  markers: DayMarker[];
  /** 20-1: the acting id when the day carries an ACTIVE pending/approved
   *  leave (the leave_requests.uuid the sheet's cancel/convert acts on);
   *  null on every other day — rejected/cancelled/revoked included. */
  leaveRequestId: string | null;
  latestCorrection?: LatestCorrectionView;
}

/** Owner envelope — the single-employee range. */
export interface DayStatusesResponse {
  employeeId: string;
  from: string;
  to: string;
  today: string;
  days: DayStatusRow[];
}

/** Technician envelope — the own range (identity from the JWT only). */
export interface MeDayStatusesResponse {
  from: string;
  to: string;
  today: string;
  days: DayStatusRow[];
}

const STATUS_KEYS: readonly DayStatusKey[] = [
  'not_tracked',
  'not_checked_in_yet',
  'in_progress',
  'weekly_off',
  'holiday',
  'worked_on_holiday',
  'leave',
  'half_day_leave',
  'present',
  'half_day',
  'absent',
  'checkout_missing',
];

const MARKER_KEYS: readonly DayMarker[] = [
  'corrected',
  'leave_pending',
  'checkout_missing',
  'fake_location_attempt',
];

/**
 * The DESIGN.md StatusBadge labels, verbatim — the wire vocabulary's one
 * display-name source. dayStatusVisual (the FE visual table) references
 * these and the correction-value formatter reads them directly, so a label
 * change can never drift between the calendar, the sheet and the history.
 */
export const DAY_STATUS_LABELS: Record<DayStatusKey, string> = {
  not_tracked: 'Not tracked',
  not_checked_in_yet: 'Not checked in yet',
  in_progress: 'In progress',
  weekly_off: 'Weekly off',
  holiday: 'Holiday',
  worked_on_holiday: 'Worked on holiday',
  leave: 'Leave',
  half_day_leave: 'Half-day leave',
  present: 'Present',
  half_day: 'Half day',
  absent: 'Absent',
  checkout_missing: 'Check-out missing',
};

const isStatusKey = (value: unknown): value is DayStatusKey =>
  typeof value === 'string' && STATUS_KEYS.includes(value as DayStatusKey);

/**
 * Whitelist-normalizes one row. The status word is the contract: an unknown
 * one THROWS (the fetch-level fail-closed rule). `latestCorrection` stays
 * absent unless the wire carried it — the sheet keys off that absence.
 */
function normalizeRow(raw: unknown): DayStatusRow {
  const record =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : null;
  if (record == null || !isStatusKey(record.status)) {
    throw new Error(
      `day-statuses: unknown or missing status word ${JSON.stringify(
        record?.status ?? raw,
      )}`,
    );
  }
  if (
    typeof record.workDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(record.workDate)
  ) {
    // Same fail-closed rule as the status: a bogus-keyed row would silently
    // render as a Not-tracked cell — exactly the misrepresentation this
    // normalizer exists to prevent.
    throw new Error(
      `day-statuses: missing or malformed workDate ${JSON.stringify(
        record.workDate ?? null,
      )}`,
    );
  }
  const row = raw as DayStatusRow;
  return {
    ...row,
    status: row.status,
    // 20-1: a drifted wire that drops the id fails CLOSED to null — the
    // sheet's leave CTAs read `!= null`, never a maybe-undefined.
    leaveRequestId:
      typeof row.leaveRequestId === 'string' ? row.leaveRequestId : null,
    markers: Array.isArray(row.markers)
      ? row.markers.filter(
          (marker): marker is DayMarker =>
            MARKER_KEYS.includes(marker as DayMarker),
        )
      : [],
  };
}

function normalizeDays(raw: unknown): DayStatusRow[] {
  if (!Array.isArray(raw)) {
    throw new Error('day-statuses: `days` is not a list');
  }
  // Map (not a lenient filter): one bad row fails the WHOLE fetch.
  return raw.map(normalizeRow);
}

/** `GET /attendance/day-statuses` — one employee's range, oldest first. */
export async function fetchDayStatuses(
  employeeId: string,
  from: string,
  to: string,
): Promise<DayStatusesResponse> {
  const res = await apiClient.get<DayStatusesResponse>(
    '/attendance/day-statuses',
    { params: { employeeId, from, to } },
  );
  return { ...res.data, days: normalizeDays(res.data.days) };
}

/** `GET /attendance/me/day-statuses` — the JWT identity's own range. */
export async function fetchMyDayStatuses(
  from: string,
  to: string,
): Promise<MeDayStatusesResponse> {
  const res = await apiClient.get<MeDayStatusesResponse>(
    '/attendance/me/day-statuses',
    { params: { from, to } },
  );
  return { ...res.data, days: normalizeDays(res.data.days) };
}

/**
 * '2026-09' → the calendar month's `{ from, to }` bounds (inclusive). Pure
 * string/UTC math — no device zone involvement, and one month is always
 * under the wire's 62-day span cap. Throws on a malformed `yearMonth` (a
 * programmer error, not a wire condition).
 */
export function monthRange(yearMonth: string): { from: string; to: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  const year = match ? Number(match[1]) : NaN;
  const month = match ? Number(match[2]) : NaN;
  if (!match || month < 1 || month > 12) {
    throw new Error(`monthRange: malformed year-month "${yearMonth}"`);
  }
  // Day 0 of the NEXT month = this month's last day (handles Feb/leap).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = match[2];
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${lastDay}` };
}
