/**
 * monthlyModel.ts — the monthly views' pure helpers (Stories 19-5/19-6).
 * No React, no I/O — the screens render, this decides: the month shift
 * (18-3's original, whose surviving home is this module — the lab screen
 * retired with 19-6 and the drill-down imports it from here), the ONE
 * month-name table (shared by the list screen, the self view and
 * RealMonthPane — the 19-4 review's no-third-MONTH_NAMES rule), the
 * fetch-window clamp, the decimal credit formatter and the chips/caption/
 * meta/a11y builders.
 *
 * All date work is string surgery on `YYYY-MM` / `YYYY-MM-DD` (the
 * dayDetailModel doctrine — never a Date built from the device zone);
 * `shiftYearMonth`'s UTC math is on the explicit 1st, so it is zone-free
 * too. The lexicographic compare on `YYYY-MM-DD` strings is chronological
 * — `monthlyWindow`'s min-clamp relies on it.
 */
import { monthRange } from '../../../services/resources/attendanceDayStatus';
import type {
  EmployeeMonthlyRow,
  MonthlyEmployeeSummary,
} from '../../../services/resources/attendanceMonthly';

/** 'YYYY-MM' shifted by n months (UTC math on the explicit 1st) — 18-3's
 *  original, housed here since the lab retired: the drill-down and the
 *  self view both import it, so the screens can never drift. */
export function shiftYearMonth(yearMonth: string, months: number): string {
  const next = new Date(
    Date.UTC(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)) - 1 + months, 1),
  );
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The month-name table — ONE per app (the pane and the list share it). */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'YYYY-MM' → "September 2026" (the pane's private table, moved here
 *  verbatim — the output is identical). */
export function monthTitle(yearMonth: string): string {
  // Defensive: a malformed year-month (only reachable via a hand-built
  // route param — the real call sites are echo-derived) renders as its
  // own raw string, never "undefined YYYY".
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) return yearMonth;
  return `${MONTH_NAMES[Number(yearMonth.slice(5, 7)) - 1]} ${yearMonth.slice(0, 4)}`;
}

/** 'YYYY-MM-DD' → "12 Oct" (19-6's holiday rows) — string surgery on the
 *  wire date, short-named from the ONE month table; never a Date built
 *  from the device zone (the customers-local formatter is Date-based and
 *  deliberately not reused). */
export function formatHolidayShortDate(holidayDate: string): string {
  return `${Number(holidayDate.slice(8, 10))} ${MONTH_NAMES[
    Number(holidayDate.slice(5, 7)) - 1
  ].slice(0, 3)}`;
}

/** 'YYYY-MM' → the month's day count (UTC math on the month's 0th day —
 *  zone-free like shiftYearMonth; 0 on malformed input, when the summary
 *  card simply renders no length chip). */
export function daysInMonth(yearMonth: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) return 0;
  return new Date(
    Date.UTC(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0),
  ).getUTCDate();
}

/** '2026-10-04' → "Sunday, 4 Oct 2026" — the holiday rows' FULL date (the
 *  2026-10 My Month redesign). The weekday comes from a noon-anchored
 *  Date (the formatTodaySubtitle idiom — the wire date, never the device
 *  clock); the rest is string surgery. Malformed input renders the wire
 *  value verbatim rather than "undefined Oct". */
export function formatHolidayFullDate(holidayDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) return holidayDate;
  const y = Number(holidayDate.slice(0, 4));
  const m = Number(holidayDate.slice(5, 7));
  const d = Number(holidayDate.slice(8, 10));
  const weekday = new Date(y, m - 1, d, 12, 0, 0, 0).toLocaleDateString('en-IN', {
    weekday: 'long',
  });
  return `${weekday}, ${d} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}

/**
 * The fetch window for a displayed month: `monthRange(yearMonth)` with
 * `to = min(range.to, today)` — uniform, so a past month is a no-op clamp
 * and the current month clamps to today (the BE 422s a future `to`; the
 * wire's `today` echo is the only clock, never the device). Lexicographic
 * compare is chronological on `YYYY-MM-DD`. `today == null` never reaches
 * here — the screens' disabled-until-known rule gates the fetch.
 */
export function monthlyWindow(
  yearMonth: string,
  today: string,
): { from: string; to: string } {
  const range = monthRange(yearMonth);
  return { from: range.from, to: range.to < today ? range.to : today };
}

/** A summary credit as display text: an integer renders bare ("18"), a
 *  decimal keeps its one place ("17.5" — FR-11 credits are 0.5-stepped,
 *  so one decimal is faithful). */
export function formatCredit(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A summary chip — one atomic Text on the row's chips line (a wrap
 *  breaks BETWEEN chips, never mid-phrase). `key` selects the family
 *  colour in MonthlyEmployeeRow's map (colour lives with the component,
 *  the KpiTile precedent). `count` is the number the label shows — the
 *  row greys a chip whose count is 0 (a green zero reads as good). */
export interface MonthlyChipSpec {
  key:
    | 'daysWorked'
    | 'halfDays'
    | 'lateCount'
    | 'leave'
    | 'absent'
    | 'checkoutMissing';
  label: string;
  count: number;
}

const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The chips line's specs, in the D4 order: `daysWorked` ALWAYS first (the
 * anchor — zero is an answer), then halfDays / lateCount / leave / absent
 * / checkoutMissing each only when > 0 (zero-suppressed). Number-first
 * copy throughout (the copy table).
 *
 * With half days on the row the worked credit no longer renders as
 * "«n» worked" — that number counts a half day as 0.5 while the half-day
 * chip repeats the same days, so the pair read as a double display
 * (2026-10 copy review). It splits instead: "«fullDays» full · «n» half
 * day(s)", fullDays = worked − 0.5 × halfDays rounded for display (the
 * underlying credit math is untouched). No half days: "«n» worked" stays.
 */
export function summaryChips(summary: MonthlyEmployeeSummary): MonthlyChipSpec[] {
  const chips: MonthlyChipSpec[] = [];
  if (summary.halfDays > 0) {
    const fullDays = Math.round(summary.daysWorked - 0.5 * summary.halfDays);
    chips.push({
      key: 'daysWorked',
      label: `${formatCredit(fullDays)} full`,
      count: fullDays,
    });
    chips.push({
      key: 'halfDays',
      label: plural(summary.halfDays, 'half day'),
      count: summary.halfDays,
    });
  } else {
    chips.push({
      key: 'daysWorked',
      label: `${formatCredit(summary.daysWorked)} worked`,
      count: summary.daysWorked,
    });
  }
  if (summary.lateCount > 0) {
    chips.push({
      key: 'lateCount',
      label: `${summary.lateCount} late`,
      count: summary.lateCount,
    });
  }
  if (summary.leave > 0) {
    chips.push({
      key: 'leave',
      label: `${formatCredit(summary.leave)} leave`,
      count: summary.leave,
    });
  }
  if (summary.absent > 0) {
    chips.push({
      key: 'absent',
      label: `${summary.absent} absent`,
      count: summary.absent,
    });
  }
  if (summary.checkoutMissing > 0) {
    chips.push({
      key: 'checkoutMissing',
      label: plural(summary.checkoutMissing, 'missing check-out'),
      count: summary.checkoutMissing,
    });
  }
  return chips;
}

/**
 * The meta line's count segments (19-6 D5; extracted from captionSegments
 * so the owner caption and the self view's meta line stay ONE
 * implementation): `«n» weekly off«s»`, `«n» holiday«s»`,
 * `«n» worked on holiday` ("on holiday" alone reads as LEAVE — the a11y
 * pass's noun-anchored fix), each zero-suppressed. An empty array means
 * the whole line is omitted.
 */
export function summaryMetaSegments(summary: MonthlyEmployeeSummary): string[] {
  const segments: string[] = [];
  if (summary.weeklyOffs > 0) {
    segments.push(plural(summary.weeklyOffs, 'weekly off'));
  }
  if (summary.holidays > 0) {
    segments.push(plural(summary.holidays, 'holiday'));
  }
  if (summary.workedOnHoliday > 0) {
    segments.push(`${formatCredit(summary.workedOnHoliday)} worked on holiday`);
  }
  return segments;
}

/**
 * The caption line's segments (all zero-suppressed; the office first when
 * the wire carried one, then the shared meta counts).
 */
export function captionSegments(row: EmployeeMonthlyRow): string[] {
  const segments: string[] = [];
  if (row.officeName !== null) {
    segments.push(row.officeName);
  }
  segments.push(...summaryMetaSegments(row.summary));
  return segments;
}

/** The caption line as displayed — segments joined " · ", '' when every
 *  segment is absent (the row omits the line entirely then). */
export function monthlyCaption(row: EmployeeMonthlyRow): string {
  return captionSegments(row).join(' · ');
}

/**
 * The row's ONE accessibility label (the Pressable carries it; children
 * are hidden). COMMAS never "·" (TalkBack reads the dot):
 * `«name». «chips», «caption»` — chips zero-suppressed with the worked
 * anchor first, then the caption sentence `«office», «n» weekly offs,
 * «n» holidays, «n» worked on holiday`, omitted entirely when empty.
 */
export function monthlyRowA11yLabel(row: EmployeeMonthlyRow): string {
  const base = `${row.employeeName}. ${summaryChips(row.summary)
    .map(chip => chip.label)
    .join(', ')}`;
  const caption = captionSegments(row).join(', ');
  return caption === '' ? base : `${base}. ${caption}`;
}
