import {
  buildTodayTiles,
  deriveTodayButtonState,
  formatCountdown,
  formatCountdownWords,
  messageForApiError,
  needsHolidayConfirm,
  needsLeaveConfirm,
} from './attendanceTodayModel';
import type { AttendanceTodayFacts } from '../../../services/resources/attendanceMe';

/**
 * Story 16-4 — the pure state machine (spec D4) and copy table (spec §4).
 * Tester stance: the state PRIORITY is the contract (offline > location >
 * rate-limit > latches > done > ready), the copy for catalogued outcomes
 * is the SERVER's verbatim (the AC's "exact PRD-specified message"), and
 * the countdown clamps (a time-bound disabled state must never turn
 * indefinite). If the implementation changed but the AC did not, these
 * must still pass.
 */

const base = {
  permission: 'granted' as const,
  online: true,
  factsKnown: true,
  record: null,
  resolving: false,
  dialogPending: false,
  rateLimitedUntil: null,
  now: 1_000_000,
};

const openRecord = {
  checkinAt: '2026-09-29T10:16:00+05:30',
  checkoutAt: null,
  lateMinutes: 61,
  isLate: true,
  workedMinutes: null,
  earlyCheckout: null,
  earlyCheckoutMinutes: null,
};

const closedRecord = {
  ...openRecord,
  checkoutAt: '2026-09-29T18:05:00+05:30',
  workedMinutes: 469,
  earlyCheckout: false,
  earlyCheckoutMinutes: null,
};

describe('deriveTodayButtonState — the priority ladder (first match wins)', () => {
  it('a plain working day with no record → readyIn', () => {
    expect(deriveTodayButtonState(base)).toEqual({ kind: 'readyIn' });
  });

  it('offline beats EVERYTHING (even resolving) — a doomed request must never be shown as progress', () => {
    expect(
      deriveTodayButtonState({ ...base, online: false, resolving: true }),
    ).toEqual({ kind: 'offline' });
  });

  it.each([
    ['denied', 'permissionDenied'],
    ['preciseOff', 'preciseOff'],
    ['serviceOff', 'serviceOff'],
  ] as const)('location state %s blocks before any readiness state', (permission, kind) => {
    expect(deriveTodayButtonState({ ...base, permission })).toEqual({ kind });
  });

  it('a LIVE rate limit outranks ready (its disabled-ness is time-bound)', () => {
    expect(
      deriveTodayButtonState({
        ...base,
        rateLimitedUntil: base.now + 60_000,
      }),
    ).toEqual({ kind: 'rateLimited', remainingS: 60, action: 'in' });
    // While checked in, the pending action outlives the block: the
    // blocked button is a blocked CHECK OUT.
    expect(
      deriveTodayButtonState({
        ...base,
        record: openRecord,
        rateLimitedUntil: base.now + 60_000,
      }),
    ).toEqual({ kind: 'rateLimited', remainingS: 60, action: 'out' });
  });

  it('an EXPIRED rate limit falls through to readiness (the block self-lifts)', () => {
    expect(
      deriveTodayButtonState({
        ...base,
        rateLimitedUntil: base.now - 1,
      }),
    ).toEqual({ kind: 'readyIn' });
  });

  it('the rate-limit remaining CLAMPS to the awarded window (a backward clock change can never extend the block)', () => {
    expect(
      deriveTodayButtonState({
        ...base,
        rateLimitedUntil: base.now + 999_999_000, // clock tampered far ahead
      }),
    ).toEqual({ kind: 'rateLimited', remainingS: 600, action: 'in' }); // MAX_RATE_WINDOW_S
  });

  it('the dialog latch and resolving are momentary and outrank the record state', () => {
    expect(
      deriveTodayButtonState({ ...base, dialogPending: true, record: openRecord }),
    ).toEqual({ kind: 'dialogPending' });
    expect(
      deriveTodayButtonState({ ...base, resolving: true, record: openRecord }),
    ).toEqual({ kind: 'resolving' });
  });

  it('a closed record → done; an open record → readyOut (the button flips, never shows both)', () => {
    expect(deriveTodayButtonState({ ...base, record: closedRecord })).toEqual({
      kind: 'done',
    });
    expect(deriveTodayButtonState({ ...base, record: openRecord })).toEqual({
      kind: 'readyOut',
    });
  });

  it('facts UNKNOWN (first load in flight) gates nothing visible but the copy path — the VIEW disables the button', () => {
    // The model still answers readyIn; the interactive gate is the view's
    // factsKnown → enabled prop (the split is deliberate: the model is
    // pure truth, the view adds the gate).
    expect(deriveTodayButtonState({ ...base, factsKnown: false })).toEqual({
      kind: 'readyIn',
    });
  });
});

describe('messageForApiError — the copy table (server-verbatim for catalogued codes)', () => {
  it('the four location outcomes render the server message VERBATIM (the AC demands the exact PRD message)', () => {
    const tooFar = {
      code: 'ATTENDANCE_TOO_FAR',
      message: 'You are 1357 m from Hero wala. Move within 150 m.',
    };
    expect(messageForApiError(tooFar)).toEqual({
      tone: 'error',
      text: 'You are 1357 m from Hero wala. Move within 150 m.',
    });
    expect(
      messageForApiError({
        code: 'ATTENDANCE_LOW_ACCURACY',
        message: 'Location not accurate enough, try again in the open',
      }),
    ).toMatchObject({ tone: 'error' });
  });

  it('rate limited keeps the server copy (with the live count), tone error', () => {
    expect(
      messageForApiError({
        code: 'ATTENDANCE_RATE_LIMITED',
        message: 'Too many attempts. Try again in 10 min',
        retryAfterSeconds: 600,
      }),
    ).toEqual({
      tone: 'error',
      text: 'Too many attempts. Try again in 10 min',
    });
  });

  it('leave_confirmation_required has NO entry — the 17-8 holding string is RETIRED (the AC copy lives only in the leave dialog)', () => {
    // A 409 that reaches this table is the TERMINAL posture (a
    // flag-carrying retry cannot 409): the generic server-message error,
    // never dialog copy outside a dialog, never a re-dialog.
    const msg = messageForApiError({
      code: 'ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED',
      message: 'You have leave today. Confirm to cancel it and check in',
    });
    expect(msg).toEqual({
      tone: 'error',
      text: 'You have leave today. Confirm to cancel it and check in',
    });
  });

  it('an empty-message leave 409 falls to the shared generic line (never renders nothing)', () => {
    expect(
      messageForApiError({ code: 'ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED', message: '' }),
    ).toEqual({
      tone: 'error',
      text: 'Something went wrong with that request.',
    });
  });

  it('transport errors (NETWORK_ERROR/TIMEOUT) surface their own toApiError copy', () => {
    expect(
      messageForApiError({
        code: 'NETWORK_ERROR',
        message: 'Could not reach the server. Check your connection and try again.',
      }),
    ).toMatchObject({ text: 'Could not reach the server. Check your connection and try again.' });
  });
});

describe('needsHolidayConfirm — the 16-4 pre-flight scope', () => {
  const facts = (over: Partial<AttendanceTodayFacts>): AttendanceTodayFacts => ({
    date: '2026-09-29',
    isWeeklyOff: false,
    isHoliday: false,
    holidayName: null,
    isWorkingDay: true,
    leaveState: null,
    leavePart: null,
    ...over,
  });

  it('a weekly off OR a holiday today asks; a working day does not', () => {
    expect(needsHolidayConfirm(facts({ isWeeklyOff: true }))).toBe(true);
    expect(needsHolidayConfirm(facts({ isHoliday: true }))).toBe(true);
    expect(needsHolidayConfirm(facts({}))).toBe(false);
  });

  it('facts ABSENT (undefined = pre-16-4 backend) never asks — the server still records the truth', () => {
    expect(needsHolidayConfirm(undefined)).toBe(false);
    expect(needsHolidayConfirm(null)).toBe(false);
  });
});

describe('needsLeaveConfirm — byte-parity with the BE D11 gate (17-8 D2)', () => {
  /**
   * The BE gate VERBATIM (fenzit-be `check-in-out.service.ts:186-195`,
   * the `leaveGateActive` block):
   *
   *   const leaveGateActive =
   *     kind === 'check_in' &&
   *     ctx.leaveState !== null &&
   *     ctx.leavePart === 'full_day' &&
   *     ctx.isWorkingDay;
   *
   * Mirrored here conjunct-for-conjunct so any FE drift against the
   * recorded gate fails this test (the spec's byte-parity demand).
   * The BE copy is hand-retyped — a BE-side drift fails nothing HERE
   * (separate repos): there the BE's own suite catches it, and at
   * runtime the authoritative server gate + the wire-driven 409
   * fallback remain the net.
   */
  function beLeaveGate(input: {
    kind: 'check_in' | 'check_out';
    isWorkingDay: boolean;
    leaveState: 'pending' | 'approved' | null;
    leavePart: 'full_day' | 'first_half' | 'second_half' | null;
  }): boolean {
    const leaveGateActive =
      input.kind === 'check_in' &&
      input.leaveState !== null &&
      input.leavePart === 'full_day' &&
      input.isWorkingDay;
    return leaveGateActive;
  }

  const facts = (over: Partial<AttendanceTodayFacts>): AttendanceTodayFacts => ({
    date: '2026-09-29',
    isWeeklyOff: false,
    isHoliday: false,
    holidayName: null,
    isWorkingDay: true,
    leaveState: null,
    leavePart: null,
    ...over,
  });

  it('the FULL truth table (2 kinds × 2 working-day × 3 states × 4 parts) matches the service condition exactly', () => {
    const kinds = ['check_in', 'check_out'] as const;
    const states = [null, 'pending', 'approved'] as const;
    const parts = [null, 'full_day', 'first_half', 'second_half'] as const;
    let rows = 0;
    for (const kind of kinds) {
      for (const isWorkingDay of [true, false]) {
        for (const leaveState of states) {
          for (const leavePart of parts) {
            const today = facts({ isWorkingDay, leaveState, leavePart });
            expect(needsLeaveConfirm(today, kind)).toBe(
              beLeaveGate({ kind, isWorkingDay, leaveState, leavePart }),
            );
            rows += 1;
          }
        }
      }
    }
    expect(rows).toBe(48);
  });

  it('each conjunct is load-bearing (the readable four rows of the matrix)', () => {
    expect(needsLeaveConfirm(facts({ leaveState: 'approved', leavePart: 'full_day' }), 'check_in')).toBe(true);
    expect(needsLeaveConfirm(facts({ leaveState: 'pending', leavePart: 'full_day' }), 'check_in')).toBe(true);
    expect(needsLeaveConfirm(facts({ leaveState: 'approved', leavePart: 'full_day' }), 'check_out')).toBe(false);
    expect(needsLeaveConfirm(facts({ leaveState: 'approved', leavePart: 'full_day', isWorkingDay: false }), 'check_in')).toBe(false);
  });

  it('half-day parts are strictly NOTHING — first_half and second_half never ask (FR-9 pass-through is structural)', () => {
    expect(needsLeaveConfirm(facts({ leaveState: 'approved', leavePart: 'first_half' }), 'check_in')).toBe(false);
    expect(needsLeaveConfirm(facts({ leaveState: 'pending', leavePart: 'second_half' }), 'check_in')).toBe(false);
  });

  it('cancelled/revoked reads null (the post-auto-cancel shape) — no dialog', () => {
    expect(needsLeaveConfirm(facts({}), 'check_in')).toBe(false);
  });

  it('legacy absence: today undefined/null never asks; leaveState ABSENT on the wire (pre-17-8 sub-field) never asks', () => {
    expect(needsLeaveConfirm(undefined, 'check_in')).toBe(false);
    expect(needsLeaveConfirm(null, 'check_in')).toBe(false);
    const legacySubfield = facts({}) as Partial<AttendanceTodayFacts>;
    delete legacySubfield.leaveState;
    delete legacySubfield.leavePart;
    expect(needsLeaveConfirm(legacySubfield as AttendanceTodayFacts, 'check_in')).toBe(false);
  });

  it('needsLeaveConfirm and needsHolidayConfirm are MUTUALLY EXCLUSIVE (the isWorkingDay conjunct) — no ladder-order rule exists', () => {
    // Well-formed facts couple isWorkingDay = !isWeeklyOff && !isHoliday,
    // so on any day the leave predicate can fire, the holiday one cannot.
    const onLeaveWorkingDay = facts({ leaveState: 'approved', leavePart: 'full_day' });
    expect(needsLeaveConfirm(onLeaveWorkingDay, 'check_in')).toBe(true);
    expect(needsHolidayConfirm(onLeaveWorkingDay)).toBe(false);
    // The off-day-inside-leave shape (the D1 read does not filter on
    // working-day): leaveState non-null, isWorkingDay false — the HOLIDAY
    // dialog owns the day, exactly as the BE gate behaves.
    const offDayInsideLeave = facts({
      isWeeklyOff: true,
      isWorkingDay: false,
      leaveState: 'approved',
      leavePart: 'full_day',
    });
    expect(needsLeaveConfirm(offDayInsideLeave, 'check_in')).toBe(false);
    expect(needsHolidayConfirm(offDayInsideLeave)).toBe(true);
  });
});

describe('countdown and checked-in formatting', () => {
  it('formatCountdown renders M:SS and clamps negatives', () => {
    expect(formatCountdown(527)).toBe('8:47');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it('the countdown announces in WORDS for a11y (an M:SS chip is unreadable through a screen reader)', () => {
    expect(formatCountdownWords(60)).toBe('Try again in 1 minute');
    expect(formatCountdownWords(600)).toBe('Try again in 10 minutes');
  });
});

describe('buildTodayTiles — the punch card\'s data (2026-10 tab redesign)', () => {
  const formatTime = (iso: string) => (iso.includes('10:16') ? '10:16 AM' : '6:05 PM');

  it('a closed record builds both tile times, the worked pill and the late pill from the merge(checkIn, checkOut) shape', () => {
    expect(buildTodayTiles(closedRecord, formatTime)).toEqual({
      checkinText: '10:16 AM',
      checkoutText: '6:05 PM',
      workedText: '7 h 49 m',
      lateText: 'Late by 61 min',
      earlyText: null,
      earlyBeforeShiftText: null,
    });
  });

  it('a MID-SESSION record still builds the card — the checkout tile reads null ("—" on screen), no worked pill yet', () => {
    expect(buildTodayTiles(openRecord, formatTime)).toEqual({
      checkinText: '10:16 AM',
      checkoutText: null,
      workedText: null,
      lateText: 'Late by 61 min',
      earlyText: null,
      earlyBeforeShiftText: null,
    });
  });

  it('early checkout surfaces its pill + the before-shift caption; a non-late day has no late pill', () => {
    expect(
      buildTodayTiles(
        { ...closedRecord, isLate: false, lateMinutes: 0, earlyCheckout: true, earlyCheckoutMinutes: 30 },
        formatTime,
      ),
    ).toMatchObject({
      lateText: null,
      earlyText: 'Early by 30 min',
      earlyBeforeShiftText: '0 h 30 m before shift',
    });
  });

  it('a corrupt worked value (non-finite) renders no pill — never a negative or NaN string', () => {
    expect(
      buildTodayTiles({ ...closedRecord, workedMinutes: Number.NaN } as never, formatTime),
    ).toMatchObject({ workedText: null });
  });
});
