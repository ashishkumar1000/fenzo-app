/**
 * enrolmentsModel — pure row-truth helpers for the roster surfaces
 * (Story 15-9). Owns the raw-truth rule the 15-8 device walkthrough
 * pinned: per-employee state derives from the UNGATED fields
 * (`attendanceStartDate` vs today + the live `officeId`) — NEVER the
 * TENANT-module `attendanceEnabled` flag (false for every row until setup
 * completes), and `attendanceStartDate: null` never means "covers today".
 *
 * `enrolmentCoversToday` lives here now; `wizardModel` re-exports it so
 * the wizard's gate keeps its import shape (15-8 tests untouched).
 *
 * Nothing here touches React, navigation or the API.
 */
import type { EnrolmentOverview } from '../../../services';
import { formatLongDate } from '../../../utils';

/** The three raw-truth states a roster row can be in. */
export type EnrolmentRowState = 'never' | 'upcoming' | 'covering';

export function enrolmentCoversToday(
  row: Pick<EnrolmentOverview, 'attendanceStartDate'>,
  today: string,
): boolean {
  return row.attendanceStartDate !== null && row.attendanceStartDate <= today;
}

/** The start date of a future (upcoming) enrolment, or null. */
export function upcomingStart(
  row: Pick<EnrolmentOverview, 'attendanceStartDate'>,
  today: string,
): string | null {
  return row.attendanceStartDate !== null && row.attendanceStartDate > today
    ? row.attendanceStartDate
    : null;
}

export function rowState(
  row: Pick<EnrolmentOverview, 'attendanceStartDate'>,
  today: string,
): EnrolmentRowState {
  if (row.attendanceStartDate === null) return 'never';
  return enrolmentCoversToday(row, today) ? 'covering' : 'upcoming';
}

/** Chip copy for a pre-picked start date: "Starts today" (nothing picked,
 *  today picked, or a stale past pick — a chip mounted across IST midnight
 *  degrades rather than claiming a date the wire won't send) or
 *  "Starts {long date}" for a genuine future pick. */
export function startChipLabel(pickedDate: string | null, today: string): string {
  if (pickedDate === null || pickedDate <= today) {
    return 'Starts today';
  }
  return `Starts ${formatLongDate(pickedDate)}`;
}

/** The `startDate` param an enable should carry for this pre-pick: the
 *  future date, or undefined (= omit → server-default today). Same
 *  degradation rule as the label — the wire never carries a past date. */
export function startChipParam(
  pickedDate: string | null | undefined,
  today: string,
): string | undefined {
  if (pickedDate === undefined || pickedDate === null) return undefined;
  return pickedDate > today ? pickedDate : undefined;
}

/** Effective-date defaults for the reassign sheet: a covering employee
 *  moves from today (FR-6 "from the date it's made, or a future date" —
 *  the picker floor is today); an upcoming employee's only in-enrolment
 *  dates start at their enrolment start (a later one is a legitimate
 *  scheduled move). A never-enrolled row has no reassign affordance; the
 *  fallback mirrors the covering case defensively. */
export function reassignSheetDefaults(
  row: Pick<EnrolmentOverview, 'attendanceStartDate'>,
  today: string,
): { effectiveFrom: string; minDate: string } {
  const start = upcomingStart(row, today);
  if (start !== null) {
    return { effectiveFrom: start, minDate: start };
  }
  return { effectiveFrom: today, minDate: today };
}

/** A future-dated reassignment the hook has recorded for a row. */
export interface ScheduledMove {
  officeId: string;
  effectiveFrom: string;
}

/** A scheduled move no longer deserves its note — any of:
 *  - the row is gone (roster refetch dropped it);
 *  - the row stopped being enrolled (a disable cancelled the period);
 *  - the row already shows the move's office as its current truth (the
 *    move took effect for a covering employee, OR an upcoming employee
 *    reassigned at their start — the view anchors upcoming employees at
 *    the next period's start, so their write response already carries the
 *    new office and the note would duplicate the row's own sub-line);
 *  - the move's date arrived but the row shows a DIFFERENT office (the
 *    move was undone by a disable/re-enable elsewhere — the GET cannot
 *    see future assignments, so this is the only arrival check there is). */
export function isMoveSettled(
  row: Pick<EnrolmentOverview, 'attendanceStartDate' | 'officeId'> | undefined,
  move: ScheduledMove,
  today: string,
): boolean {
  if (!row) return true;
  if (row.attendanceStartDate === null) return true;
  if (row.officeId === move.officeId) {
    if (enrolmentCoversToday(row, today)) return true;
    if (
      upcomingStart(row, today) !== null &&
      upcomingStart(row, today) === move.effectiveFrom
    ) {
      return true;
    }
  }
  return move.effectiveFrom <= today && row.officeId !== move.officeId;
}
