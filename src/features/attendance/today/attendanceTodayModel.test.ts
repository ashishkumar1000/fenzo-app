import {
  buildTodayTiles,
  deriveTodayButtonState,
  formatCountdown,
  formatCountdownWords,
  formatMetresGrouped,
  freshDistanceM,
  messageForApiError,
  needsHolidayConfirm,
  needsLeaveConfirm,
  punchStatusCard,
  PUNCH_FIX_FRESH_MS,
} from './attendanceTodayModel';
import { haversineMetres } from '../../../utils/distanceUtils';
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
      workedText: '7 hrs 49 min',
      lateText: 'Checked in late by 1 hr 1 min',
      earlyText: null,
      earlyBeforeShiftText: null,
    });
  });

  it('a MID-SESSION record still builds the card — the checkout tile reads null ("—" on screen), no worked pill yet', () => {
    expect(buildTodayTiles(openRecord, formatTime)).toEqual({
      checkinText: '10:16 AM',
      checkoutText: null,
      workedText: null,
      lateText: 'Checked in late by 1 hr 1 min',
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
      earlyText: 'Checked out early by 30 min',
      earlyBeforeShiftText: '30 min before shift',
    });
  });

  it('a corrupt worked value (non-finite) renders no pill — never a negative or NaN string', () => {
    expect(
      buildTodayTiles({ ...closedRecord, workedMinutes: Number.NaN } as never, formatTime),
    ).toMatchObject({ workedText: null });
  });
});

// --- 20-3: the geofence prescreen (client lock rungs + the status card) ---

/** Office at (12, 77); the fix sits ~28.5 m north of it — inside a 150 m
 *  fence but outside a 20 m one, and ~11.1 km from the far anchor. */
const OFFICE = { latitude: 12.0, longitude: 77.0, radiusM: 150, name: 'Hero wala' };
const FAR_OFFICE = { ...OFFICE, radiusM: 20 };
const IN_FIX = { latitude: 12.000256, longitude: 77.0, capturedAt: 900_000 };
const OUT_FIX = { latitude: 12.1, longitude: 77.0, capturedAt: 900_000 };

describe('deriveTodayButtonState — the geofence rungs (20-3 prescreen)', () => {
  it('a fresh fix beyond the radius LOCKS the punch-in (the client prescreen posture, distance carried)', () => {
    expect(
      deriveTodayButtonState({ ...base, fix: OUT_FIX, office: FAR_OFFICE }),
    ).toEqual({
      kind: 'locked',
      distanceM: haversineMetres(OUT_FIX, FAR_OFFICE),
    });
  });

  it('beyond the radius with an OPEN record locks the CHECK OUT instead', () => {
    expect(
      deriveTodayButtonState({
        ...base,
        record: openRecord,
        fix: OUT_FIX,
        office: OFFICE,
      }),
    ).toEqual({
      kind: 'lockedOut',
      distanceM: haversineMetres(OUT_FIX, OFFICE),
    });
  });

  it('a fresh IN-fence fix carries the distance on the ready rungs (the ready-vs-fallback discriminator)', () => {
    expect(
      deriveTodayButtonState({ ...base, fix: IN_FIX, office: OFFICE }),
    ).toEqual({
      kind: 'readyIn',
      distanceM: haversineMetres(IN_FIX, OFFICE),
    });
    expect(
      deriveTodayButtonState({
        ...base,
        record: openRecord,
        fix: IN_FIX,
        office: OFFICE,
      }),
    ).toEqual({
      kind: 'readyOut',
      distanceM: haversineMetres(IN_FIX, OFFICE),
    });
  });

  it.each([
    ['no fix', { office: OFFICE }],
    ['no office', { fix: OUT_FIX }],
    ['radiusless office', { fix: OUT_FIX, office: { ...OFFICE, radiusM: null } }],
  ] as const)('%s NEVER locks — the plain ready rung (the row-5 fallback)', (_name, input) => {
    expect(deriveTodayButtonState({ ...base, ...input })).toEqual({ kind: 'readyIn' });
    expect(
      deriveTodayButtonState({ ...base, record: openRecord, ...input }),
    ).toEqual({ kind: 'readyOut' });
  });

  it('the freshness lease is exactly 120 s — one millisecond past it fails OPEN', () => {
    const boundary = { ...OUT_FIX, capturedAt: base.now - PUNCH_FIX_FRESH_MS };
    expect(
      deriveTodayButtonState({ ...base, fix: boundary, office: FAR_OFFICE }),
    ).toEqual({
      kind: 'locked',
      distanceM: haversineMetres(boundary, FAR_OFFICE),
    });
    const expired = { ...OUT_FIX, capturedAt: base.now - PUNCH_FIX_FRESH_MS - 1 };
    expect(
      deriveTodayButtonState({ ...base, fix: expired, office: FAR_OFFICE }),
    ).toEqual({ kind: 'readyIn' });
  });

  it('a backward clock step (fix timestamp in the future) fails open like any stale fix', () => {
    const timeTraveled = { ...OUT_FIX, capturedAt: base.now + 60_000 };
    expect(
      deriveTodayButtonState({ ...base, fix: timeTraveled, office: FAR_OFFICE }),
    ).toEqual({ kind: 'readyIn' });
  });

  it('the lock is a PRESREEN: it never masks the blocking postures above it, nor done below', () => {
    expect(
      deriveTodayButtonState({
        ...base,
        online: false,
        fix: OUT_FIX,
        office: FAR_OFFICE,
      }),
    ).toEqual({ kind: 'offline' });
    expect(
      deriveTodayButtonState({
        ...base,
        rateLimitedUntil: base.now + 60_000,
        fix: OUT_FIX,
        office: FAR_OFFICE,
      }),
    ).toEqual({ kind: 'rateLimited', remainingS: 60, action: 'in' });
    expect(
      deriveTodayButtonState({
        ...base,
        record: closedRecord,
        fix: OUT_FIX,
        office: FAR_OFFICE,
      }),
    ).toEqual({ kind: 'done' });
  });
});

describe('freshDistanceM — the status card input', () => {
  it('answers the straight-line distance only for a fresh fix + known radius', () => {
    expect(freshDistanceM(IN_FIX, OFFICE, base.now)).toBe(
      haversineMetres(IN_FIX, OFFICE),
    );
    expect(
      freshDistanceM({ ...IN_FIX, capturedAt: 0 }, OFFICE, base.now),
    ).toBeNull();
    expect(freshDistanceM(null, OFFICE, base.now)).toBeNull();
    expect(freshDistanceM(IN_FIX, null, base.now)).toBeNull();
    expect(
      freshDistanceM(IN_FIX, { ...OFFICE, radiusM: null }, base.now),
    ).toBeNull();
  });
});

describe('formatMetresGrouped — the mockup\'s comma-grouped metres', () => {
  it('rounds to whole metres and groups thousands', () => {
    expect(formatMetresGrouped(0)).toBe('0 m');
    expect(formatMetresGrouped(28)).toBe('28 m');
    expect(formatMetresGrouped(1357)).toBe('1,357 m');
    expect(formatMetresGrouped(1355.4)).toBe('1,355 m');
    expect(formatMetresGrouped(-3)).toBe('0 m');
  });
});

describe('punchStatusCard — the approved mockup table, copy verbatim', () => {
  const flat = (c: { segments: { text: string }[] }) =>
    c.segments.map(s => s.text).join('');

  it('readyIn in-fence → the green card (row 1)', () => {
    const card = punchStatusCard({
      state: { kind: 'readyIn', distanceM: 28 },
      fix: IN_FIX,
      office: OFFICE,
      now: base.now,
      checkinTimeText: null,
      elapsedText: null,
    });
    expect(card).toMatchObject({
      tone: 'done',
      title: 'Within Office Geofence',
      chip: 'READY TO PUNCH',
    });
    expect(flat(card!)).toBe(
      `You are at Hero wala (${formatMetresGrouped(
        haversineMetres(IN_FIX, OFFICE),
      )} away). Location verified via GPS.`,
    );
  });

  it('readyOut in-fence → the BLUE card with the elapsed span (row 2)', () => {
    const card = punchStatusCard({
      state: { kind: 'readyOut', distanceM: 28 },
      fix: IN_FIX,
      office: OFFICE,
      now: base.now,
      checkinTimeText: '9:02 AM',
      elapsedText: '7 h 14 m',
    });
    expect(card).toMatchObject({
      tone: 'progress',
      title: 'Shift Active • In Office',
      chip: 'READY TO PUNCH OUT',
    });
    expect(flat(card!)).toBe(
      'Checked in at 9:02 AM (7 h 14 m elapsed). Ready to conclude your workday at Hero wala.',
    );
  });

  it('readyOut in-fence with no elapsed yet degrades the span, never a placeholder', () => {
    const card = punchStatusCard({
      state: { kind: 'readyOut', distanceM: 28 },
      fix: IN_FIX,
      office: OFFICE,
      now: base.now,
      checkinTimeText: '9:02 AM',
      elapsedText: null,
    });
    expect(flat(card!)).toBe(
      'Checked in at 9:02 AM. Ready to conclude your workday at Hero wala.',
    );
  });

  it('locked → the red card with the radius instruction (row 3)', () => {
    const card = punchStatusCard({
      state: { kind: 'locked', distanceM: 1357 },
      fix: OUT_FIX,
      office: OFFICE,
      now: base.now,
      checkinTimeText: null,
      elapsedText: null,
    });
    expect(card).toMatchObject({
      tone: 'cancelled',
      title: 'Outside Office Geofence',
      chip: 'PUNCH DISABLED',
    });
    expect(flat(card!)).toBe(
      'You are 1,357 m from Hero wala branch. Move within 150 m to punch.',
    );
  });

  it('lockedOut → the amber card addressed to the checked-in employee (row 4)', () => {
    const card = punchStatusCard({
      state: { kind: 'lockedOut', distanceM: 1357 },
      fix: OUT_FIX,
      office: OFFICE,
      now: base.now,
      checkinTimeText: '9:02 AM',
      elapsedText: '3 h 53 m',
    });
    expect(card).toMatchObject({
      tone: 'scheduled',
      title: 'Out of Bounds for Check-out',
      chip: 'LOCKED',
    });
    expect(flat(card!)).toBe(
      'You checked in at 9:02 AM. You are currently 1,357 m away. Move closer to punch out.',
    );
  });

  it('the row-5 postures carry the EXISTING remediation copy in the neutral card', () => {
    const offline = punchStatusCard({
      state: { kind: 'offline' },
      fix: null,
      office: null,
      now: base.now,
      checkinTimeText: null,
      elapsedText: null,
    });
    expect(flat(offline!)).toBe(
      "You're offline. Check-in needs a working connection.",
    );
    const rateLimited = punchStatusCard({
      state: { kind: 'rateLimited', remainingS: 582, action: 'in' },
      fix: null,
      office: null,
      now: base.now,
      checkinTimeText: null,
      elapsedText: null,
    });
    expect(flat(rateLimited!)).toBe('Too many attempts. Try again in 9:42');
    const resolving = punchStatusCard({
      state: { kind: 'resolving' },
      fix: null,
      office: null,
      now: base.now,
      checkinTimeText: null,
      elapsedText: null,
    });
    expect(resolving).toMatchObject({ tone: 'neutral', title: 'Getting your location…' });
  });

  it('a ready posture WITHOUT a fresh fix is the getting-location card — never a green lie', () => {
    expect(
      punchStatusCard({
        state: { kind: 'readyIn' },
        fix: null,
        office: OFFICE,
        now: base.now,
        checkinTimeText: null,
        elapsedText: null,
      }),
    ).toMatchObject({ tone: 'neutral', title: 'Getting your location…' });
  });

  it('done and dialogPending render NO card', () => {
    expect(
      punchStatusCard({
        state: { kind: 'done' },
        fix: IN_FIX,
        office: OFFICE,
        now: base.now,
        checkinTimeText: null,
        elapsedText: null,
      }),
    ).toBeNull();
    expect(
      punchStatusCard({
        state: { kind: 'dialogPending' },
        fix: IN_FIX,
        office: OFFICE,
        now: base.now,
        checkinTimeText: null,
        elapsedText: null,
      }),
    ).toBeNull();
  });

  it('every card announces its title + flat body for screen readers', () => {
    const card = punchStatusCard({
      state: { kind: 'locked', distanceM: 1357 },
      fix: OUT_FIX,
      office: OFFICE,
      now: base.now,
      checkinTimeText: null,
      elapsedText: null,
    });
    expect(card!.announce).toBe(
      'Outside Office Geofence You are 1,357 m from Hero wala branch. Move within 150 m to punch.',
    );
  });
});
