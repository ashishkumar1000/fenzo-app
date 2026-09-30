/**
 * attendanceTodayModel.ts — the CheckInOutButton's pure state machine
 * (Story 16-4, spec D4) and the exact copy table (spec §4).
 *
 * One derivation function, first match wins:
 *   offline → permissionDenied → preciseOff → serviceOff → rateLimited →
 *   dialogPending → resolving → done → readyOut → readyIn
 *
 * Priority rationale: offline blocks everything; the location states block
 * the tap legally; the rate limit's disabled-ness is time-bound;
 * dialogPending/resolving are the latches that make double-taps no-ops;
 * done replaces the button entirely (never both visible — AC).
 */
import { formatWorkedMinutes } from '../../../utils/offsetInstant';
import type {
  AttendanceTodayFacts,
  AttendanceTodayRecord,
} from '../../../services/resources/attendanceMe';

export type AttendanceLocationPermission =
  | 'granted'
  | 'denied'
  | 'preciseOff'
  | 'serviceOff';

export type TodayButtonState =
  | { kind: 'offline' }
  | { kind: 'permissionDenied' }
  | { kind: 'preciseOff' }
  | { kind: 'serviceOff' }
  | { kind: 'rateLimited'; remainingS: number; action: 'in' | 'out' }
  | { kind: 'dialogPending' }
  | { kind: 'resolving' }
  | { kind: 'done' }
  | { kind: 'readyOut' }
  | { kind: 'readyIn' };

export interface TodayModelInput {
  permission: AttendanceLocationPermission;
  online: boolean;
  /** True when the summary has LOADED — no interactive check-in before the
   *  day facts are known (the holiday gate must be able to fire). */
  factsKnown: boolean;
  record: AttendanceTodayRecord | null;
  resolving: boolean;
  dialogPending: boolean;
  /** Epoch ms when the rate-limit block lifts; null when not blocked. */
  rateLimitedUntil: number | null;
  now: number;
}

export function deriveTodayButtonState(input: TodayModelInput): TodayButtonState {
  if (!input.online) return { kind: 'offline' };
  if (input.permission === 'denied') return { kind: 'permissionDenied' };
  if (input.permission === 'preciseOff') return { kind: 'preciseOff' };
  if (input.permission === 'serviceOff') return { kind: 'serviceOff' };
  if (input.rateLimitedUntil !== null && input.rateLimitedUntil > input.now) {
    return {
      kind: 'rateLimited',
      // Clamped to the awarded window: a backward clock change can push the
      // raw delta past it, and a time-bound disabled state must never turn
      // indefinite.
      remainingS: Math.min(
        Math.ceil((input.rateLimitedUntil - input.now) / 1000),
        MAX_RATE_WINDOW_S,
      ),
      // The pending action outlives the block: while checked in, the
      // blocked button is a blocked CHECK OUT, never a "Check in".
      action: input.record ? 'out' : 'in',
    };
  }
  if (input.dialogPending) return { kind: 'dialogPending' };
  if (input.resolving) return { kind: 'resolving' };
  if (input.record?.checkoutAt) return { kind: 'done' };
  if (!input.factsKnown) {
    // Facts unknown (first load in flight or failed) — the button is not
    // interactive until the holiday gate COULD fire. Rendered as readyIn
    // but disabled via factsKnown by the caller.
    return { kind: 'readyIn' };
  }
  return input.record ? { kind: 'readyOut' } : { kind: 'readyIn' };
}

/** The PRD's rate window (16-1 D6) — the fallback when the Retry-After
 *  header is missing, and the countdown clamp ceiling. */
export const MAX_RATE_WINDOW_S = 600;

/** The countdown label, "Try again in 9:42" (M:SS). A clamped, always-
 *  finite remaining: 0 renders as 0:00, negatives never leak. */
export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.trunc(totalSeconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The countdown in words for the screen-reader announcement ("Try again
 *  in 9 minutes") — an M:SS chip is unreadable through a11y. */
export function formatCountdownWords(totalSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(Math.max(0, totalSeconds) / 60));
  return `Try again in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** Below-button message per settled outcome (server copy is verbatim —
 *  the AC's "exact PRD-specified message" travels in ApiError.message). */
export type TodayOutcomeMessage =
  | { tone: 'error'; text: string }
  | { tone: 'info'; text: string };

export function messageForApiError(err: {
  code: string;
  message: string;
  retryAfterSeconds?: number;
}): TodayOutcomeMessage {
  switch (err.code) {
    case 'ATTENDANCE_RATE_LIMITED':
      return {
        tone: 'error',
        text: err.message || 'Too many attempts. Try again in 10 minutes.',
      };
    default:
      // Every catalogued code carries its own PRD copy server-side
      // ("You are 600 m from …", "Check in before checking out", …);
      // transport errors carry their own copy from toApiError. An empty
      // message (a non-ApiError rejection) falls back to the shared line
      // rather than rendering nothing.
      //
      // ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED (17-8 D4) has NO entry
      // here on purpose: its AC copy lives in exactly one place — the
      // leave dialog. A 409 with that code is intercepted by the hook's
      // press continuation (the awaited wire-driven fallback); one that
      // still reaches this table is the terminal posture (a flag-carrying
      // retry cannot 409) and renders the generic server-message error.
      return {
        tone: 'error',
        text: err.message || 'Something went wrong with that request.',
      };
  }
}

/** The checked-in line above the Check out button
 *  ("Checked in 10:22 AM · Late by 22 min"). */
export function formatCheckedInLine(
  record: { lateMinutes: number | null; isLate: boolean },
  timeText: string | null,
): string | null {
  if (!timeText) return null;
  const lateSuffix =
    record.isLate && record.lateMinutes !== null && record.lateMinutes > 0
      ? ` · Late by ${record.lateMinutes} min`
      : '';
  return `Checked in ${timeText}${lateSuffix}`;
}

/** The done card's data (times + worked hours) from the merged record. */
export interface DoneCardModel {
  checkinText: string | null;
  checkoutText: string | null;
  workedText: string | null;
  lateText: string | null;
  earlyText: string | null;
}

export function buildDoneCard(
  record: AttendanceTodayRecord,
  formatTime: (iso: string) => string | null,
): DoneCardModel {
  const lateText =
    record.isLate && record.lateMinutes !== null && record.lateMinutes > 0
      ? `Late by ${record.lateMinutes} min`
      : null;
  const earlyText =
    record.earlyCheckout && record.earlyCheckoutMinutes !== null
      ? `Early by ${record.earlyCheckoutMinutes} min`
      : null;
  return {
    checkinText: formatTime(record.checkinAt),
    checkoutText: record.checkoutAt ? formatTime(record.checkoutAt) : null,
    workedText: formatWorkedMinutes(record.workedMinutes),
    lateText,
    earlyText,
  };
}

/** The offline block message (one string, three call sites in the hook). */
export const offlineMessage = "You're offline. Check-in needs a working connection.";

/** The capture-failure copy per union member (UX table verbatim). */
export function captureFailureMessage(failure: unknown): string {
  switch (failure) {
    case 'timeout':
      return "Couldn't get your location. Move to an open area and try again.";
    case 'permission':
      return 'Attendance needs your location to check in and out. You can still view your records and apply for leave without it.';
    case 'unavailable':
      return 'Location services are unavailable. Turn on location and try again.';
    case 'stale':
      return 'Your location seems outdated. Refresh GPS and try again';
    default:
      return 'Could not determine your location. Try again.';
  }
}

/** True when the tap needs the holiday/weekly-off pre-flight confirm
 *  (16-4 scope). `today` absent (legacy backend) never asks — the server
 *  still records the truth. Mutually exclusive with `needsLeaveConfirm`
 *  by construction: this is true only when `isWorkingDay` is false, and
 *  the leave predicate requires it true — there IS no ladder-order rule
 *  to pin (leave + holiday can only ever surface the holiday dialog,
 *  exactly as the BE gate behaves). */
export function needsHolidayConfirm(
  today: AttendanceTodayFacts | null | undefined,
): boolean {
  if (!today) return false;
  return today.isWeeklyOff || today.isHoliday;
}

/**
 * True when the check-in needs the FR-9 full-day-leave confirm (17-8 D2):
 * the FULL byte-parity mirror of the BE D11 gate (fenzit-be
 * `check-in-out.service.ts:186-195` — `leaveGateActive`):
 *
 *   kind === 'check_in' && ctx.isWorkingDay && ctx.leaveState !== null &&
 *   ctx.leavePart === 'full_day'
 *
 * with `today != null` standing in for the summary's legacy absence
 * signal (a pre-17-8 wire has no leave fields; `today` absent is the
 * 16-4 signal). A model test asserts the parity against the service
 * condition conjunct-for-conjunct. Half-day parts (`first_half` /
 * `second_half`) are strictly NOTHING — no dialog, no subtext, no copy
 * anywhere (the gate is full_day-only, so pass-through is structural).
 * Check-out is never gated (FR-9 is check-in only).
 */
export function needsLeaveConfirm(
  today: AttendanceTodayFacts | null | undefined,
  kind: 'check_in' | 'check_out',
): boolean {
  return (
    kind === 'check_in' &&
    today != null &&
    today.isWorkingDay === true &&
    today.leaveState != null &&
    today.leavePart === 'full_day'
  );
}
