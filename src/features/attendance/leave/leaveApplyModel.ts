/**
 * leaveApplyModel.ts — the Leave apply form's pure model (Story 17-5,
 * spec D3/D4). The screen renders; this decides. Everything here is
 * date-STRING arithmetic over `YYYY-MM-DD` (AD-7 — never `new Date()` on
 * a wire date; the one UTC constructor below builds FROM date parts, it
 * never parses an instant).
 *
 * The single-date rule drives three behaviours:
 *   - half-day options are visible only when a From exists AND the pick
 *     is single-date (a range renders a single "Full day" segment);
 *   - a date change that would leave `part ≠ full_day` on a true range
 *     resets the part (with the inline note) — `To == From` normalizes
 *     back to single-date and keeps the half-day;
 *   - the wire body omits `endDate` on a single date and `part` on
 *     full_day (the BE DTO defaults both — verified at leave.dto.ts).
 */
import type { LeavePart } from '../../../services/resources/attendanceLeave';

/** The form's ephemeral state (D9 — every entry starts empty). */
export interface LeaveFormState {
  from: string | null;
  to: string | null;
  part: LeavePart;
}

/** One transition's outcome: the next state + whether the half-day reset
 *  note should render (true only on the transition that just reset). */
export interface LeaveFormStep {
  state: LeaveFormState;
  resetNote: boolean;
}

const EMPTY_STATE: LeaveFormState = { from: null, to: null, part: 'full_day' };

export function initialLeaveForm(): LeaveFormStep {
  return { state: EMPTY_STATE, resetNote: false };
}

/** `to == null || to === from` — the wire-shape truth: `To == From`
 *  normalizes to single-date (the BE treats start==end the same way). */
export function isSingleDate(from: string | null, to: string | null): boolean {
  return to == null || to === from;
}

/** Half-day options exist only for a picked, single-date leave. */
export function isHalfDayVisible(state: LeaveFormState): boolean {
  return state.from != null && isSingleDate(state.from, state.to);
}

export const LEAVE_TYPE_LABELS: Record<LeavePart, string> = {
  full_day: 'Full day',
  first_half: 'First half',
  second_half: 'Second half',
};

const ALL_TYPE_OPTIONS: { value: LeavePart; label: string }[] = (
  Object.entries(LEAVE_TYPE_LABELS) as [LeavePart, string][]
).map(([value, label]) => ({ value, label }));

/** With a range picked the control renders a single "Full day" segment —
 *  the block itself never hides (hiding would orphan the reset note). */
export function typeOptions(
  state: LeaveFormState,
): { value: LeavePart; label: string }[] {
  return isHalfDayVisible(state)
    ? ALL_TYPE_OPTIONS
    : [ALL_TYPE_OPTIONS[0]];
}

/**
 * The post-date-change normaliser — every date transition funnels through
 * here so the invariants hold by construction:
 *   - From moved past a picked To ⇒ To clears (never an inverted range);
 *   - a true range with `part ≠ full_day` ⇒ part resets to full_day and
 *     the reset note flag rides the step (a same-day To keeps the part).
 */
function normalize(next: LeaveFormState): LeaveFormStep {
  const to =
    next.to != null && next.from != null && next.to < next.from
      ? null
      : next.to;
  const isRange = to != null && to !== next.from;
  const reset = isRange && next.part !== 'full_day';
  return {
    state: { from: next.from, to, part: reset ? 'full_day' : next.part },
    resetNote: reset,
  };
}

/** Picking From: clears a To it moved past; a still-single-date pick
 *  keeps the half-day (it still applies to exactly one date). */
export function pickFrom(state: LeaveFormState, date: string): LeaveFormStep {
  return normalize({ ...state, from: date });
}

/** Picking To (the row is gated on From, so `from == null` is defensive):
 *  a different second date on a half-day resets the part + note; To ==
 *  From stays single-date and keeps the half-day. */
export function pickTo(state: LeaveFormState, date: string): LeaveFormStep {
  if (state.from == null) return { state, resetNote: false };
  return normalize({ ...state, to: date });
}

/** The To row's "Clear": half-day options return; `part` stays as-is —
 *  no silent restore of a previous choice (the user re-picks). */
export function clearTo(state: LeaveFormState): LeaveFormStep {
  return { state: { ...state, to: null }, resetNote: false };
}

/** A type tap: the part changes, the reset note clears (D3). */
export function changePart(state: LeaveFormState, part: LeavePart): LeaveFormStep {
  return { state: { ...state, part }, resetNote: false };
}

/** The wire's date/part slice — `endDate` omitted on a single date,
 *  `part` omitted on full_day (both together when applicable). */
export interface LeaveWireDates {
  startDate: string;
  endDate?: string;
  part?: LeavePart;
}

export function buildWireDates(state: LeaveFormState): LeaveWireDates | null {
  if (!state.from) return null;
  const single = isSingleDate(state.from, state.to);
  return {
    startDate: state.from,
    ...(single ? {} : { endDate: state.to as string }),
    ...(single && state.part !== 'full_day' ? { part: state.part } : {}),
  };
}

/** The POST body: the wire dates plus the (already trimmed) reason. The
 *  submit gate guarantees `from`, so the empty fallback never fires. */
export function buildApplyBody(
  state: LeaveFormState,
  reason: string,
): LeaveWireDates & { reason: string } {
  const dates = buildWireDates(state) ?? { startDate: '' };
  return { ...dates, reason };
}

/** The count chip's copy — the server's integer, verbatim, pluralised. */
export function workingDaysCopy(workingDays: number): string {
  return workingDays === 1 ? '1 working day' : `${workingDays} working days`;
}

/** The picker floor: today − 7 (the PRD back-date limit; the BE ladder
 *  rejects before it anyway — the picker just blocks the obvious miss). */
export const LEAVE_MIN_PAST_DAYS = 7;

export function minSelectableDate(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d - LEAVE_MIN_PAST_DAYS));
  return shifted.toISOString().slice(0, 10);
}
