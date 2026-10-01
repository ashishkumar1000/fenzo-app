/**
 * attendanceMeModel.ts — pure display + gating logic for the technician's
 * attendance surfaces (Story 15-10). No React, no network.
 *
 * Times: the wire carries `HH:mm` (the API convention); the 12-hour
 * rendering is THIS app's job (NFR-5, spec-15-10 decision) — never render
 * a wire time verbatim. Dates render through the shared `formatLongDate`.
 * Weekly offs: ISO weekday numbers (1=Mon..7=Sun) from the summary
 * payload; `[]` means the employee works all 7 days.
 */
import { formatLongDate } from '../../../utils/formatLongDate';
import type { AttendanceAccess, AttendanceSummary } from '../../../services';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "09:30" → "9:30 AM", "18:00" → "6:00 PM". Malformed input returns null. */
export function formatHhmm12(hhmm: string | null | undefined): string | null {
  if (typeof hhmm !== 'string' || !/^\d{2}:\d{2}$/.test(hhmm.trim())) return null;
  const [h, m] = hhmm.trim().split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** "9:30 AM – 6:00 PM", or null when either end is missing/malformed. */
export function formatTimingRange(
  startTime: string | null,
  endTime: string | null,
): string | null {
  const from = formatHhmm12(startTime);
  const to = formatHhmm12(endTime);
  return from && to ? `${from} – ${to}` : null;
}

/** "Late after 9:45 AM" from the rule's start + cut-off minutes; null when either is missing. */
export function formatCutOffCopy(
  startTime: string | null,
  lateCutOffMinutes: number | null,
): string | null {
  const from = formatHhmm12(startTime);
  if (!from || lateCutOffMinutes === null || lateCutOffMinutes < 0) return null;
  const [h, m] = (startTime as string).split(':').map(Number);
  const total = h * 60 + m + lateCutOffMinutes;
  const cutH = Math.floor(total / 60) % 24;
  const cutM = total % 60;
  const cut = formatHhmm12(`${String(cutH).padStart(2, '0')}:${String(cutM).padStart(2, '0')}`);
  return cut ? `Late after ${cut}` : null;
}

/** [1, 7] → "Mon, Sun"; [] → "No weekly offs" (works all week). */
export function formatWeeklyOffs(days: number[]): string {
  if (!Array.isArray(days) || days.length === 0) return 'No weekly offs';
  const labels = days
    .filter(d => Number.isInteger(d) && d >= 1 && d <= 7)
    .sort((a, b) => a - b)
    .map(d => WEEKDAY_LABELS[d - 1]);
  return labels.length > 0 ? labels.join(', ') : 'No weekly offs';
}

/** "Attendance starts on {date}" — long-form, server date displayed as-is. */
export function formatStartsOnCopy(attendanceStartDate: string | null): string | null {
  if (typeof attendanceStartDate !== 'string' || attendanceStartDate.length < 10) return null;
  return `Attendance starts on ${formatLongDate(attendanceStartDate.slice(0, 10))}`;
}

/**
 * The FR-4 intro gate (spec: finding #5): `active`/`upcoming` only and
 * never yet onboarded. A `history_only` employee's tracking has ended —
 * asking them for location permission on a surface that can never check
 * in contradicts the epic's "Tracked employee's first entry".
 */
export function shouldShowIntro(access: AttendanceAccess | null): boolean {
  if (!access) return false;
  if (access.attendanceAccess !== 'active' && access.attendanceAccess !== 'upcoming') {
    return false;
  }
  return access.onboardedAt === null;
}

// --- Policy-card rows (the 2026-10 tab redesign) ---
// The redesigned "Shift & location policy" card renders the same four
// facts as icon rows, each with an optional right-side chip. The chips
// derive from fields the summary ALREADY carries (never new wire data):
//   Timings      → the shift duration ("7h shift")
//   Late cut-off → the grace window ("15m grace")
//   Weekly offs  → the off-day label ("Friday off")

/** ISO weekday 1 (Mon) .. 7 (Sun) → the full weekday name (chip copy). */
const WEEKDAY_FULL = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/** "09:00" → minutes since midnight; null on malformed/not-HH:mm. */
function hhmmMinutes(hhmm: string | null | undefined): number | null {
  if (typeof hhmm !== 'string' || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** "09:00"+"17:00" → "8h shift"; a half hour renders "8h 30m shift".
 *  Null when either end is missing/malformed or reversed — a chip that
 *  says "-1h shift" would be worse than no chip. */
export function shiftDurationChip(
  startTime: string | null,
  endTime: string | null,
): string | null {
  const from = hhmmMinutes(startTime);
  const to = hhmmMinutes(endTime);
  if (from === null || to === null || to <= from) return null;
  const whole = Math.trunc(to - from);
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ''} shift`;
}

/** 15 → "15m grace"; null when absent/non-positive (a 0m grace window is
 *  not a grace the employee can see — the value row alone is honest). */
export function graceChip(lateCutOffMinutes: number | null): string | null {
  if (
    lateCutOffMinutes === null ||
    lateCutOffMinutes === undefined ||
    !Number.isFinite(lateCutOffMinutes) ||
    lateCutOffMinutes <= 0
  ) {
    return null;
  }
  return `${Math.trunc(lateCutOffMinutes)}m grace`;
}

/** [5] → "Friday off"; [5,6] → "2 days off"; [] → null (the value row
 *  already reads "No weekly offs" — a chip would repeat it). */
export function weeklyOffChip(days: number[]): string | null {
  if (!Array.isArray(days)) return null;
  const valid = days.filter(d => Number.isInteger(d) && d >= 1 && d <= 7);
  if (valid.length === 1) return `${WEEKDAY_FULL[valid[0] - 1]} off`;
  if (valid.length > 1) return `${valid.length} days off`;
  return null;
}

/** The policy card's rows: the attendance-policy fields (office, timings,
 *  cutoff, weekly offs) each with its derived chip text (null = no chip).
 *  Null rows are omitted; weekly offs always render. */
export interface PolicyRow {
  key: 'office' | 'timings' | 'cutOff' | 'weekly';
  label: string;
  value: string;
  chip: string | null;
}

export function buildPolicyRows(summary: AttendanceSummary | null): PolicyRow[] {
  if (!summary) return [];
  const rows: PolicyRow[] = [];
  if (summary.officeName) {
    rows.push({
      key: 'office',
      label: 'Office',
      value: summary.officeName,
      chip: 'Assigned branch',
    });
  }
  const timings = formatTimingRange(summary.startTime, summary.endTime);
  if (timings) {
    rows.push({
      key: 'timings',
      label: 'Timings',
      value: timings,
      chip: shiftDurationChip(summary.startTime, summary.endTime),
    });
  }
  const cutOff = formatCutOffCopy(summary.startTime, summary.lateCutOffMinutes);
  if (cutOff) {
    rows.push({
      key: 'cutOff',
      label: 'Late cut-off',
      value: cutOff,
      chip: graceChip(summary.lateCutOffMinutes),
    });
  }
  rows.push({
    key: 'weekly',
    label: 'Weekly offs',
    value: formatWeeklyOffs(summary.weeklyOffDays),
    chip: weeklyOffChip(summary.weeklyOffDays),
  });
  return rows;
}

// --- The tab header's today line ---
// "Today, Thursday · 12 Oct" from the WIRE's today date (never the device
// clock). Same construction as formatLongDate (noon keeps the weekday
// stable); output pinned to en-IN so a test can assert the literal.

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-10-12" → "October" (the My month banner's month chip; the WIRE
 *  date, not the device clock — null whenever the summary's today is
 *  absent, e.g. the upcoming/history_only postures). */
export function monthChipName(yyyyMmDd: string | null): string | null {
  if (typeof yyyyMmDd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
    return null;
  }
  return MONTH_LONG[Number(yyyyMmDd.slice(5, 7)) - 1] ?? null;
}

/** "2026-10-12" → "Today, Thursday · 12 Oct" (null on malformed input). */
export function formatTodaySubtitle(yyyyMmDd: string | null): string | null {
  if (typeof yyyyMmDd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
    return null;
  }
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  const weekday = dt.toLocaleDateString('en-IN', { weekday: 'long' });
  const day = Number(yyyyMmDd.slice(8, 10));
  const month = MONTH_SHORT[m - 1];
  if (!weekday || month === undefined || !Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }
  return `Today, ${weekday} · ${day} ${month}`;
}
