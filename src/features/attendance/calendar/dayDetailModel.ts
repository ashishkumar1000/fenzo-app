/**
 * dayDetailModel.ts — the DayDetailSheet's pure helpers (Story 18-3 D5).
 * No React, no I/O — the sheet renders, this decides: the sheet title, the
 * instant/distance line composition (the "(next day)" and "At the office"
 * rules) and the "is a future day" posture flag. All date work is string
 * surgery on the AD-7 offset instants / workDate — never a Date built from
 * an instant (the offsetInstant.ts rules).
 *
 * Story 18-4 adds the correction gate + write plumbing: `canCorrectDay`
 * (the D1 entry truth table), `buildOffsetInstant` + `tenantOffsetFromCarried`
 * (the D2 instant construction) and `dayTimesLine` (the correct stage's
 * subtitle slot) — same doctrine: string surgery, never a device date.
 *
 * Story 20-1 adds the LEAVE gates: `isLeaveDay` (the sheet hides "Apply
 * leave" once a leave exists on the day), `canCancelLeaveDay` and
 * `canConvertHalfDay` (the day sheet's Cancel/Convert CTAs — pending or
 * approved, present or future, never the past; the wire keeps the
 * final say with its 409s).
 */
import {
  formatOffsetInstantTime,
  formatWorkedMinutes,
} from '../../../utils/offsetInstant';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import { DAY_STATUS_LABELS } from '../../../services/resources/attendanceDayStatus';
import type { MonthStatusesScope } from './useMonthStatuses';

const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-09-14" → "14 September" (fixed English, no locale). */
export function dayMonthLabel(workDate: string): string {
  const month = Number(workDate.slice(5, 7));
  const day = Number(workDate.slice(8, 10));
  return `${day} ${MONTH_NAMES[month - 1] ?? ''}`.trim();
}

/** "2026-09-14" → "Monday, 14 September" — the sheet title (the mock's
 *  heading). UTC-anchored weekday math: explicit Y/M/D can never shift on
 *  the device zone. */
export function daySheetTitle(workDate: string): string {
  const year = Number(workDate.slice(0, 4));
  const month = Number(workDate.slice(5, 7));
  const day = Number(workDate.slice(8, 10));
  const weekday = WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${dayMonthLabel(workDate)}`;
}

/** The distance suffix — " · At the office" ONLY at exactly 0 m (the FE
 *  never guesses the geofence radius); null renders nothing. */
export function distanceSuffix(
  distanceM: number | null,
  officeName: string | null,
): string {
  if (distanceM == null) return '';
  const metres = Math.round(distanceM);
  if (metres === 0) return ' · At the office';
  return officeName
    ? ` · ${metres} m from ${officeName}`
    : ` · ${metres} m`;
}

/**
 * One instant's value line: wall-clock time verbatim + the gps distance +
 * "(next day)" when the instant's CARRIED date (its own offset-local date
 * part — string work, never timezone math) is LATER than the work date (a
 * checkout past midnight). Null instant / unparseable → null (the sheet
 * omits the whole line).
 */
export function instantValue(
  iso: string | null,
  distanceM: number | null,
  officeName: string | null,
  workDate: string,
): string | null {
  const time = formatOffsetInstantTime(iso);
  if (time == null) return null;
  let value = `${time}${distanceSuffix(distanceM, officeName)}`;
  const carried = iso != null ? iso.slice(0, 10) : null;
  if (carried != null && carried > workDate) {
    value = `${value} (next day)`;
  }
  return value;
}

/** The Worked row's value — "8 h 08 m"; null → the line is omitted. */
export function workedValue(row: DayStatusRow): string | null {
  return formatWorkedMinutes(row.workedMinutes);
}

/** The day's display label ("Present", …) — the no-row case is Not tracked. */
export function dayLabel(row: DayStatusRow | null): string {
  return DAY_STATUS_LABELS[row?.status ?? 'not_tracked'];
}

/**
 * The correction ENTRY gate (Story 18-4 D1) — true only when ALL hold:
 * owner scope (a `me` sheet never corrects, FR-21), a row exists, the
 * day's status is not the untracked posture itself (the BE's
 * DATE_NOT_TRACKED gate renders as this same status — one predicate both
 * sides), and `workDate ≤ today`. Both dates are zero-padded `YYYY-MM-DD`
 * tenant-local strings from the same wire vocabulary, so the lexicographic
 * compare is valid — and `today` is the wire echo, never the device clock.
 */
export function canCorrectDay(
  day: DayStatusRow | null,
  today: string | null,
  scope: MonthStatusesScope,
): boolean {
  if (scope.kind !== 'owner') return false;
  if (day == null || today == null) return false;
  if (day.status === 'not_tracked') return false;
  return day.workDate <= today;
}

/**
 * 20-1: does a leave exist on this day at all? True when ANY wire truth
 * says the day carries an ACTIVE pending/approved leave: the id (the
 * normal authority, populated exactly when the leave is active) OR'd with
 * the status/marker truths as drift defence — if a leave truth ever
 * arrived without the id, the sheet must still hide "Apply leave"
 * (fail-closed; CTAs stay off since they need the id for the writes).
 */
export function isLeaveDay(day: DayStatusRow | null): boolean {
  if (day == null) return false;
  return (
    day.leaveRequestId != null ||
    day.status === 'leave' ||
    day.status === 'half_day_leave' ||
    day.markers.includes('leave_pending')
  );
}

/**
 * 20-1: the "Cancel request" CTA gate — pending or approved leave, on
 * today or a strictly-future day (an approved past leave is settled
 * fact; the wire's `workDate >= today` cancels still answer 409 if it
 * has already been acted on). Never past dates.
 */
export function canCancelLeaveDay(
  day: DayStatusRow | null,
  today: string | null,
): boolean {
  if (day == null || today == null) return false;
  if (day.leaveRequestId == null) return false;
  return day.workDate >= today;
}

/**
 * 20-1: the "Convert to full day" CTA gate — only an APPROVED half-day
 * (`half_day_leave`; the wire cannot say WHICH half of a PENDING day, so
 * pending never converts), and only a strictly-future day: converting
 * the sheet's today carries the LEAVE_CHECKED_IN_CONFLICT risk on the
 * re-file, so both cancel and convert drop out on today (the employee
 * keeps the History cancel path for today's approved leaves — the
 * 17-7 stage, which the wire still permits).
 */
export function canConvertHalfDay(
  day: DayStatusRow | null,
  today: string | null,
): boolean {
  if (day == null || today == null) return false;
  if (day.status !== 'half_day_leave') return false;
  return day.workDate > today;
}

/**
 * The PUT's instant form (18-4 D2): `${workDate}T${HH:mm}:00${offset}` —
 * the wall time anchored to the work date with the CARRIED tenant offset.
 * The FE never derives an offset itself (AD-7): an offset-less wall time
 * would be anchored to the SERVER's process zone by the BE's
 * `new Date(...)` (the validator accepts the shape, the anchor lies).
 */
export function buildOffsetInstant(
  workDate: string,
  time: string,
  offset: string,
): string {
  return `${workDate}T${time}:00${offset}`;
}

/**
 * The tenant offset CARRIED from the surface (18-4 D2): the FIRST non-null
 * instant's trailing "+HH:MM", across as many rows' instants as the caller
 * has — falling back to the documented IST constant (the 17-7 non-IST
 * caveat, carried in deferred-work). Never `new Date().getTimezoneOffset()`.
 *
 * A Z-terminated instant carries `+00:00`, NOT `slice(-6)`: the BE
 * normalizes zero offsets to `Z` (check-in-out.model.ts — "GMT"/"+00:00"
 * both normalise to "Z"), so the naive slice yields `00:00Z` garbage and
 * every times-mode write for a zero-offset tenant would 422. The offset
 * tail is verified against `[+-]HH:MM` before it travels.
 */
export function tenantOffsetFromCarried(
  ...instants: ReadonlyArray<string | null | undefined>
): string {
  for (const iso of instants) {
    if (iso == null) continue;
    if (iso.endsWith('Z')) return '+00:00';
    const tail = iso.slice(-6);
    if (/^[+-]\d{2}:\d{2}$/.test(tail)) return tail;
  }
  return '+05:30';
}

/**
 * The day's current times as one compact line — "10:22 AM – 6:30 PM"
 * (wall-clock parts verbatim, the offsetInstant rules); a lone check-in
 * renders alone; a day with no parseable instants renders null (the
 * correct stage's subtitle slot omits — the omission rule).
 */
export function dayTimesLine(row: DayStatusRow | null): string | null {
  const times = [row?.checkinAt, row?.checkoutAt]
    .map(iso => formatOffsetInstantTime(iso))
    .filter((time): time is string => time != null);
  if (times.length === 0) return null;
  return times.join(' – ');
}
