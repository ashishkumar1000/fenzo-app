/**
 * leaveStatusModel.ts — the leave request's display model (Story 17-6).
 * Pure functions over the wire's shapes: the D6 status-chip table (one
 * source for owner rows, the detail sheet and the per-day split block),
 * the split-request suffix, and the "{date range}" label helper. No
 * React, no network, no `new Date()` on a wire date (AD-7 — the range
 * helper is date-STRING part arithmetic only).
 */
import type { StatusKey } from '../../../theme';
import type { LeaveRequestView } from '../../../services/resources/attendanceLeave';

/** 17-5's pluralised count copy — re-exported so every surface imports
 *  the count copy from ONE module (spec §3: one implementation). */
export { workingDaysCopy } from './leaveApplyModel';
export { LEAVE_TYPE_LABELS } from './leaveApplyModel';

// --- D6: the status chip table -------------------------------------------

/** Lucide glyph names — the components map them; the model stays pure. */
export type LeaveStatusIconName =
  | 'Clock'
  | 'CheckCircle2'
  | 'XCircle'
  | 'CalendarX'
  | 'Undo2';

export interface LeaveStatusChip {
  /** The DS Badge status key (D6 — all existing tokens, `tone="soft"`). */
  badge: StatusKey;
  label: string;
  icon: LeaveStatusIconName;
}

/**
 * The D6 table. Cancelled/Revoked are deliberately grey (`neutral` —
 * self-own/non-events; red is reserved for decisions the employee must
 * register, so Rejected stays red); the status family still separates them
 * by icon + label.
 */
const CHIP_TABLE: Record<string, LeaveStatusChip> = {
  pending: { badge: 'scheduled', label: 'Pending', icon: 'Clock' },
  approved: { badge: 'done', label: 'Approved', icon: 'CheckCircle2' },
  rejected: { badge: 'cancelled', label: 'Rejected', icon: 'XCircle' },
  cancelled: { badge: 'neutral', label: 'Cancelled', icon: 'CalendarX' },
  revoked: { badge: 'neutral', label: 'Revoked', icon: 'Undo2' },
};

/** Chip for a request OR a per-day state; the wire's status vocabulary is
 *  closed (D5 derived order) — an off-vocabulary value degrades to a
 *  neutral chip carrying the raw word, never a crash. */
export function requestStatusChip(status: string): LeaveStatusChip {
  return (
    CHIP_TABLE[status] ?? {
      badge: 'neutral',
      label: status.charAt(0).toUpperCase() + status.slice(1),
      icon: 'CalendarX',
    }
  );
}

// --- Split requests (spec D2) ---------------------------------------------

/** One `dates[]` entry (the wire's per-day state). */
export type LeaveDay = LeaveRequestView['dates'][number];

/**
 * The honest row suffix for a SPLIT request: the span-wide `workingDays`
 * integer is state-blind on the wire, so when `dates[]` carries more than
 * one distinct state the row names how many days are cancelled or revoked
 * ("2 of 5 days cancelled"). The majority non-active state wins (tie →
 * cancelled — deterministic); a span whose states are all active (never
 * observable mid-flight) renders no suffix.
 */
export interface LeaveSplitSummary {
  state: 'cancelled' | 'revoked';
  count: number;
  total: number;
  /** "{n} of {m} days cancelled|revoked" — the row prepends " · ". */
  label: string;
}

export function splitDaySummary(dates: LeaveDay[]): LeaveSplitSummary | null {
  const states = new Set(dates.map(d => d.state));
  if (states.size <= 1) return null;
  const nonActive: LeaveSplitSummary['state'][] = ['cancelled', 'revoked'];
  let best: LeaveSplitSummary['state'] | null = null;
  let bestCount = 0;
  for (const state of nonActive) {
    const count = dates.filter(d => d.state === state).length;
    if (count > bestCount) {
      best = state;
      bestCount = count;
    }
  }
  if (best === null || bestCount === 0) return null;
  return {
    state: best,
    count: bestCount,
    total: dates.length,
    label: `${bestCount} of ${dates.length} days ${best}`,
  };
}

// --- Date-range labels (spec D2) ------------------------------------------

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One date as "14 Sep 2026" — part arithmetic, locale-free (tests pin the
 *  literal output). Invalid input passes through unchanged. */
export function formatLeaveDate(yyyyMmDd: string): string {
  if (!ISO_DATE.test(yyyyMmDd)) return yyyyMmDd;
  const [y, m, d] = yyyyMmDd.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

/**
 * The span label: single-day spans collapse to one date everywhere;
 * same-month spans compress ("14–18 Sep 2026"); same-year cross-month
 * keeps both months ("28 Dec 2026 – 2 Jan 2027" covers the cross-year
 * form by carrying both years).
 */
export function formatLeaveRange(start: string, end: string): string {
  if (start === end) return formatLeaveDate(start);
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) {
    return `${formatLeaveDate(start)} – ${formatLeaveDate(end)}`;
  }
  const [sy, sm, sd] = start.split('-');
  const [ey, em, ed] = end.split('-');
  if (sy === ey) {
    const year = ` ${sy}`;
    return sm === em
      ? `${Number(sd)}–${Number(ed)} ${MONTHS[Number(sm) - 1]}${year}`
      : `${Number(sd)} ${MONTHS[Number(sm) - 1]} – ${Number(ed)} ${
          MONTHS[Number(em) - 1]
        }${year}`;
  }
  return `${formatLeaveDate(start)} – ${formatLeaveDate(end)}`;
}
