import {
  buildDoneCard,
  deriveTodayButtonState,
  formatCheckedInLine,
  formatCountdown,
  formatCountdownWords,
  messageForApiError,
  needsHolidayConfirm,
} from './attendanceTodayModel';

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

  it('leave_confirmation_required renders the PRD user copy, NEVER the enum dev text (the 17-8 holding string)', () => {
    const msg = messageForApiError({
      code: 'ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED',
      message: 'dev-facing enum text that must not render',
    });
    expect(msg).toEqual({
      tone: 'info',
      text: "You're on leave today. Checking in will cancel today's leave. Continue?",
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
  const facts = (over: Partial<Parameters<typeof needsHolidayConfirm>[0] & object>) => ({
    date: '2026-09-29',
    isWeeklyOff: false,
    isHoliday: false,
    holidayName: null,
    isWorkingDay: true,
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

  it('formatCheckedInLine carries the late flag ("Checked in 10:16 AM · Late by 61 min")', () => {
    expect(formatCheckedInLine({ lateMinutes: 61, isLate: true }, '10:16 AM')).toBe(
      'Checked in 10:16 AM · Late by 61 min',
    );
    expect(formatCheckedInLine({ lateMinutes: 0, isLate: false }, '9:00 AM')).toBe(
      'Checked in 9:00 AM',
    );
    expect(formatCheckedInLine({ lateMinutes: null, isLate: false }, null)).toBeNull();
  });
});

describe('buildDoneCard — the summary card inputs (merged record)', () => {
  const formatTime = (iso: string) => (iso.includes('10:16') ? '10:16 AM' : '6:05 PM');

  it('a closed record builds times, worked and flags from the merge(checkIn, checkOut) shape', () => {
    expect(buildDoneCard(closedRecord, formatTime)).toEqual({
      checkinText: '10:16 AM',
      checkoutText: '6:05 PM',
      workedText: '7 h 49 m',
      lateText: 'Late by 61 min',
      earlyText: null,
    });
  });

  it('early checkout surfaces its flag; a non-late day has no late flag', () => {
    expect(
      buildDoneCard(
        { ...closedRecord, isLate: false, lateMinutes: 0, earlyCheckout: true, earlyCheckoutMinutes: 30 },
        formatTime,
      ),
    ).toMatchObject({ lateText: null, earlyText: 'Early by 30 min' });
  });
});
