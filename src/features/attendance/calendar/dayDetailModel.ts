/**
 * dayDetailModel.ts — the DayDetailSheet's pure helpers (Story 18-3 D5).
 * No React, no I/O — the sheet renders, this decides: the sheet title, the
 * instant/distance line composition (the "(next day)" and "At the office"
 * rules) and the "is a future day" posture flag. All date work is string
 * surgery on the AD-7 offset instants / workDate — never a Date built from
 * an instant (the offsetInstant.ts rules).
 */
import {
  formatOffsetInstantTime,
  formatWorkedMinutes,
} from '../../../utils/offsetInstant';
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import { DAY_STATUS_LABELS } from '../../../services/resources/attendanceDayStatus';

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
