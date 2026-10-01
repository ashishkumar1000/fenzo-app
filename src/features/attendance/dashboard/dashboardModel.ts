/**
 * dashboardModel.ts — the Attendance dashboard's pure helpers (Story 19-4).
 * No React, no I/O — the screen renders, this decides: the tile list, the
 * strip anatomy, the flag-sheet row copy and the empty-state predicate.
 *
 * All date work is string surgery on the YYYY-MM-DD `workDate` (the
 * dayDetailModel doctrine — never a Date built from the device zone). The
 * sheet row's year is ALWAYS shown because a flag can come from a
 * different calendar year.
 */
import type {
  AttendanceDashboardCounts,
  CheckoutMissingRow,
  FakeLocationRow,
} from '../../../services/resources/attendanceDashboard';

const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** One KPI tile — the FR-24 questions in the spec's order (story 20-2
 *  added Short day right after Not checked in: both answer "who didn't
 *  make a proper day", but a Short day DID punch in). */
export interface KpiTileSpec {
  key:
    | 'tracked'
    | 'checkedIn'
    | 'notCheckedIn'
    | 'shortDay'
    | 'late'
    | 'onLeave';
  label: string;
  value: number;
  /** `"«Label»: «n»"` — the screen reads the tile as this string. */
  a11yLabel: string;
  /** The checked-in share of today's tracked employees (rounded %), shown
   *  as the tile's pill (19-4 redesign). null on the other five tiles. */
  pct: number | null;
}

/** The six tiles (spec copy-table order). Colour lives in KpiTile's
 *  variant map keyed by `key`; counts are answers, not states — the hue
 *  highlights the family, never judges. */
export function kpiTiles(counts: AttendanceDashboardCounts): KpiTileSpec[] {
  const entries: Array<[KpiTileSpec['key'], string]> = [
    ['tracked', 'Tracked'],
    ['checkedIn', 'Checked in'],
    ['notCheckedIn', 'Not checked in'],
    ['shortDay', 'Short day'],
    ['late', 'Late'],
    ['onLeave', 'On leave'],
  ];
  const pct = checkedInPct(counts);
  return entries.map(([key, label]) => {
    const value = counts[key];
    return {
      key,
      label,
      value,
      a11yLabel: `${label}: ${value}`,
      pct: key === 'checkedIn' ? pct : null,
    };
  });
}

/** The checked-in share of tracked, rounded to a whole percent. null when
 *  nobody is tracked (the share has no denominator then — the empty
 *  posture renders instead of the tiles anyway). */
export function checkedInPct(
  counts: AttendanceDashboardCounts,
): number | null {
  if (counts.tracked === 0) return null;
  return Math.round((counts.checkedIn / counts.tracked) * 100);
}

/** Which strip(s) render — each only when its count is > 0 (the
 *  TodaysJobsSection caller idiom; OverdueStrip's anatomy). */
export interface FlagStripSpec {
  kind: 'checkoutMissing' | 'fakeLocationAttempt';
  label: string;
  count: number;
  /** `"«Label», «n» «day|days»"` — the OverdueStrip noun-tail idiom. */
  a11yLabel: string;
  /** The strip's one-line explanation (the 19-4 redesign's secondary
   *  line) — days, never devices (the wire has no device identity). */
  detail: string;
}

/** The flags object as the wire carries it. */
type DashboardFlags = {
  checkoutMissing: CheckoutMissingRow[];
  fakeLocationAttempt: FakeLocationRow[];
};

export function flagStrips(flags: DashboardFlags): FlagStripSpec[] {
  const strips: FlagStripSpec[] = [];
  const a11y = (label: string, count: number) =>
    `${label}, ${count} ${count === 1 ? 'day' : 'days'}`;
  if (flags.checkoutMissing.length > 0) {
    strips.push({
      kind: 'checkoutMissing',
      label: 'Checkout missing',
      count: flags.checkoutMissing.length,
      a11yLabel: a11y('Checkout missing', flags.checkoutMissing.length),
      detail:
        flags.checkoutMissing.length === 1
          ? 'No check-out recorded for 1 past day.'
          : `No check-out recorded for ${flags.checkoutMissing.length} past days.`,
    });
  }
  if (flags.fakeLocationAttempt.length > 0) {
    strips.push({
      kind: 'fakeLocationAttempt',
      label: 'Fake location attempt',
      count: flags.fakeLocationAttempt.length,
      a11yLabel: a11y('Fake location attempt', flags.fakeLocationAttempt.length),
      detail:
        flags.fakeLocationAttempt.length === 1
          ? 'GPS spoofing blocked on 1 day.'
          : `GPS spoofing blocked on ${flags.fakeLocationAttempt.length} days.`,
    });
  }
  return strips;
}

/** Flag-sheet titles — plural on the list's contents, not its kind. */
export function flagSheetTitle(
  kind: FlagStripSpec['kind'] | null,
): string {
  switch (kind) {
    case 'checkoutMissing':
      return 'Checkout missing';
    case 'fakeLocationAttempt':
      return 'Fake location attempts';
    case null:
      return '';
  }
}

/** "2026-09-14" → "Monday, 14 September 2026" — the sheet-row date line
 *  (the daySheetTitle surgery pattern, year kept for cross-year flags).
 *  The format check alone is NOT enough — month 13 or day 00 passes it and
 *  rolls via Date.UTC into a different month (wrong weekday, blank month
 *  name, double spaces) — so the components are range-checked too. Anything
 *  malformed or out of range renders the raw string, never an invented date. */
export function flagRowDate(workDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return workDate;
  const year = Number(workDate.slice(0, 4));
  const month = Number(workDate.slice(5, 7));
  const day = Number(workDate.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return workDate;
  const utc = new Date(Date.UTC(year, month - 1, day));
  // Reject calendar-legal formats whose day rolls into the next month
  // (Feb 30, Apr 31) — a rendered weekday would then be a fiction.
  if (utc.getUTCDate() !== day) return workDate;
  return `${WEEKDAY_NAMES[utc.getUTCDay()]}, ${day} ${MONTH_NAMES[month - 1] ?? ''} ${year}`.trim();
}

/** One sheet row's secondary line — the date, plus the office caption
 *  (only when the wire carried one — the field is nullable) and the
 *  per-day attempt count on fake-location rows. */
export function flagRowDetail(
  row: CheckoutMissingRow & Partial<Pick<FakeLocationRow, 'attemptCount'>>,
): string {
  const date = flagRowDate(row.workDate);
  const office = row.officeName !== null ? ` · ${row.officeName}` : '';
  const attempts =
    typeof row.attemptCount === 'number'
      ? ` · ${row.attemptCount === 1 ? '1 attempt' : `${row.attemptCount} attempts`}`
      : '';
  return `${date}${office}${attempts}`;
}

/** The tracked-0 empty state — the tile grid REPLACES with this. Flags still
 *  render (past-day truth can outlive today's roster). */
export function isTrackedEmpty(counts: AttendanceDashboardCounts): boolean {
  return counts.tracked === 0;
}
