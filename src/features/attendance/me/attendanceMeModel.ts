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

/** One summary row's display triple (label + value) — null rows are omitted. */
export interface SummaryRow {
  label: string;
  value: string;
}

/** The FR-4 summary rows; rows without server data are left out entirely. */
export function buildSummaryRows(summary: AttendanceSummary | null): SummaryRow[] {
  if (!summary) return [];
  const rows: SummaryRow[] = [];
  if (summary.officeName) {
    rows.push({ label: 'Office', value: summary.officeName });
  }
  const timings = formatTimingRange(summary.startTime, summary.endTime);
  if (timings) {
    rows.push({ label: 'Timings', value: timings });
  }
  const cutOff = formatCutOffCopy(summary.startTime, summary.lateCutOffMinutes);
  if (cutOff) {
    rows.push({ label: 'Late cut-off', value: cutOff });
  }
  rows.push({ label: 'Weekly offs', value: formatWeeklyOffs(summary.weeklyOffDays) });
  return rows;
}
