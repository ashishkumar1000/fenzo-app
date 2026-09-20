/**
 * reportModel.ts — pure display/validation logic for the Reports screen
 * (story 12-6). No React, no network — the same "own your vocabulary"
 * convention as `notificationBannerModel.ts` / `stepperModel.ts`.
 *
 * Dates are IST calendar dates (`YYYY-MM-DD` strings) end to end: the
 * backend validates the range on the IST clock, so the FE speaks the same
 * vocabulary instead of shipping UTC instants. "Today in IST" is computed
 * by shifting the instant +5:30 and reading the UTC fields (fixed offset,
 * no DST — same technique as `utils/istDate.ts`).
 */
import type { ReportRequestStatus } from '../../services';

/** The PRD's range cap — inclusive of both ends (BE enforces the same). */
export const MAX_RANGE_DAYS = 92;

/** How often the history list polls while a request is queued/generating. */
export const REPORTS_POLL_MS = 5_000;

/** `YYYY-MM-DD` of "today" on the IST wall clock, from the real clock. */
export function todayIst(nowIso: string = new Date().toISOString()): string {
  return isoToIstDateString(nowIso);
}

/** UTC instant → its IST calendar date, `YYYY-MM-DD`. */
function isoToIstDateString(iso: string): string {
  const shifted = new Date(Date.parse(iso) + 5.5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * A date-picker selection → the `YYYY-MM-DD` string it represents. The
 * picker hands back a local-midnight `Date`; Fenzit's users are all on the
 * IST clock, so the device's LOCAL calendar fields are the IST calendar
 * date (a device set to another timezone was never a supported surface —
 * same assumption as `DateTimeFields`' hand-rolled `formatDate`).
 */
export function pickerDateToIso(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** A picker `Date` for the given IST/`YYYY-MM-DD` string (local midnight). */
export function isoToPickerDate(dateString: string): Date {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole days from `startDate` to `endDate`, inclusive of both ends. */
export function rangeDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return NaN;
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * The form's one validation gate, run before Generate enables and again on
 * submit. Returns the problem as user-facing copy, or null when the range
 * is valid: start ≤ end, at most 92 days inclusive, and nothing in the
 * future on the IST clock.
 */
export function validateRange(
  startDate: string,
  endDate: string,
  nowIso: string = new Date().toISOString(),
): string | null {
  if (!startDate || !endDate) return 'Date range is required';
  if (endDate < startDate) return 'Start date cannot be after end date';
  if (endDate > todayIst(nowIso)) return 'End date cannot be in the future';
  const days = rangeDays(startDate, endDate);
  if (days > MAX_RANGE_DAYS) {
    return 'Range exceeds 92 days';
  }
  return null;
}

/** Status → Badge vocabulary + sentence-case label (design-system fixed
 *  words: Done / In Progress / Scheduled / Cancelled + neutral). */
export function statusBadge(status: ReportRequestStatus): {
  status: 'done' | 'progress' | 'scheduled' | 'cancelled' | 'neutral';
  label: string;
} {
  switch (status) {
    case 'ready':
      return { status: 'done', label: 'Ready' };
    case 'generating':
      return { status: 'progress', label: 'Generating' };
    case 'failed':
      return { status: 'cancelled', label: 'Failed' };
    case 'queued':
      return { status: 'scheduled', label: 'Queued' };
  }
}

/**
 * Failed-row copy, from the engine's stable error code — a failed request
 * is a normal list row, so its explanation must be readable, never a raw
 * code (FR21). Unknown codes fall back to one honest generic line.
 */
export function failedReportCopy(errorCode: string | null | undefined): string {
  switch (errorCode) {
    case 'REPORT_GENERATION_FAILED':
      return 'Report generation failed. Try again.';
    case 'REPORT_TOO_LARGE':
      return 'Too many jobs in range. Narrow the date range.';
    default:
      return errorCode ? `Error (code: ${errorCode})` : 'This report failed. Try again.';
  }
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** `2026-09-20` → `20 Sep` (calendar dates are already IST strings). */
export function formatIstDay(dateString: string): string {
  const [, m, d] = dateString.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

/** The range label under a row's title: `1 Sep – 15 Sep 2026`. */
export function formatRangeLabel(startDate: string, endDate: string): string {
  const year = endDate.slice(0, 4);
  return `${formatIstDay(startDate)} – ${formatIstDay(endDate)} ${year}`;
}

/** 12h `h:mm AM/PM` from an HH:mm slice (Hermes-safe, no Intl). */
function format12hTime(hhmm: string): string {
  const hours = Number(hhmm.slice(0, 2));
  const suffix = hours < 12 ? 'AM' : 'PM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${hhmm.slice(3, 5)} ${suffix}`;
}

/** The row's "requested on" line, on the IST clock: `20 Sep, 4:05 PM`. */
export function formatRequestedAt(iso: string): string {
  const shifted = new Date(Date.parse(iso) + 5.5 * 60 * 60 * 1000);
  const day = shifted.toISOString().slice(0, 10);
  return `${formatIstDay(day)}, ${format12hTime(shifted.toISOString().slice(11, 16))}`;
}

/** The list row's subtitle for the technician scope. */
export function technicianScopeLabel(technicianCount: number | null): string {
  if (technicianCount === null) return 'All technicians';
  return technicianCount === 1 ? '1 technician' : `${technicianCount} technicians`;
}