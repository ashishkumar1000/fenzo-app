/**
 * utils/relativeTime.ts
 * ─────────────────────
 * "How long ago?" labels for activity rows (notifications, Story 3.4): the
 * coarse bucket ladder every feed uses — Just now · Xm · Xh · Xd · Xw —
 * falling back to a calendar date once "weeks" stops being useful.
 *
 * Elapsed-time math is timezone-agnostic by construction (two instants
 * subtract to the same duration everywhere), so — unlike the IST day math in
 * `istDate.ts` — nothing here shifts clocks. The calendar-date fallback IS a
 * wall-clock question, so it delegates to `formatIstDateLabel` (the app's
 * one date-label authority) rather than reading local fields.
 *
 * Every function takes an optional `nowMs` (default: the real clock) so
 * tests pin time instead of racing the host — same convention as istDate.ts.
 * Pure functions only; no date library.
 */
import { formatIstDateLabel } from './istDate';

const MS_PER_MIN = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;
/** Past this, "X weeks ago" becomes a date — nobody says "14 weeks ago". */
const MAX_WEEKS = 4;

/**
 * Coarse relative label for one timestamp against `nowMs`.
 * Negative or sub-minute elapsed time (clock skew, a row that just landed)
 * reads "Just now" — never a future tense or an empty string.
 */
export function relativeTime(iso: string, nowMs: number = Date.now()): string {
  const elapsed = nowMs - Date.parse(iso);
  if (!Number.isFinite(elapsed) || elapsed < MS_PER_MIN) return 'Just now';
  if (elapsed < MS_PER_HOUR) return `${Math.floor(elapsed / MS_PER_MIN)}m ago`;
  if (elapsed < MS_PER_DAY) return `${Math.floor(elapsed / MS_PER_HOUR)}h ago`;
  if (elapsed < MS_PER_DAY * 7) return `${Math.floor(elapsed / MS_PER_DAY)}d ago`;
  if (elapsed < MS_PER_DAY * 7 * MAX_WEEKS) {
    return `${Math.floor(elapsed / (MS_PER_DAY * 7))}w ago`;
  }
  return formatIstDateLabel(iso);
}
