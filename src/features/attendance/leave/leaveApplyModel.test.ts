/**
 * Pure-model tests for `leaveApplyModel` (Story 17-5, spec §4): the
 * half-day visibility truth table, the reset-note set/clear, the From-past-
 * To clear, the Clear-affordance part pin, the wire-body matrix (endDate
 * omitted on single; part omitted on full_day; both together), the count
 * copy's integer-verbatim plural rule (NO 0.5 anywhere — review F1), and
 * the today−7 picker-floor arithmetic across month/year rollovers.
 */
import {
  buildApplyBody,
  buildWireDates,
  changePart,
  clearTo,
  initialLeaveForm,
  isHalfDayVisible,
  isSingleDate,
  LEAVE_MIN_PAST_DAYS,
  minSelectableDate,
  pickFrom,
  pickTo,
  typeOptions,
  workingDaysCopy,
} from './leaveApplyModel';

describe('half-day visibility (spec D3 — zero-date hole)', () => {
  it('no From ⇒ Full-day only (the empty state never offers halves)', () => {
    const step = initialLeaveForm();
    expect(isHalfDayVisible(step.state)).toBe(false);
    expect(typeOptions(step.state)).toEqual([{ value: 'full_day', label: 'Full day' }]);
  });

  it('From, no To ⇒ all three type options', () => {
    const step = pickFrom(initialLeaveForm().state, '2026-10-05');
    expect(isHalfDayVisible(step.state)).toBe(true);
    expect(typeOptions(step.state).map(o => o.value)).toEqual([
      'full_day',
      'first_half',
      'second_half',
    ]);
  });

  it('To == From ⇒ still single-date, half-day stays allowed', () => {
    const base = pickFrom(initialLeaveForm().state, '2026-10-05');
    expect(isSingleDate(base.state.from, base.state.to)).toBe(true);
    const step = pickTo(base.state, '2026-10-05');
    expect(isHalfDayVisible(step.state)).toBe(true);
    expect(typeOptions(step.state)).toHaveLength(3);
  });

  it('a true range ⇒ the control collapses to a single Full day segment', () => {
    const base = pickFrom(initialLeaveForm().state, '2026-10-05');
    const step = pickTo(base.state, '2026-10-09');
    expect(isHalfDayVisible(step.state)).toBe(false);
    expect(typeOptions(step.state)).toEqual([{ value: 'full_day', label: 'Full day' }]);
  });
});

describe('the reset rule (half-day on a range resets + notes)', () => {
  it('picking a DIFFERENT To while first_half resets to full_day + the note', () => {
    const base = pickFrom(initialLeaveForm().state, '2026-10-05');
    const half = changePart(base.state, 'first_half');
    expect(half.state.part).toBe('first_half');
    const step = pickTo(half.state, '2026-10-09');
    expect(step.state.part).toBe('full_day');
    expect(step.resetNote).toBe(true);
  });

  it('picking To == From keeps the half-day and never notes', () => {
    const base = pickFrom(initialLeaveForm().state, '2026-10-05');
    const half = changePart(base.state, 'second_half');
    const step = pickTo(half.state, '2026-10-05');
    expect(step.state.part).toBe('second_half');
    expect(step.resetNote).toBe(false);
  });

  it('the note clears on the next type change', () => {
    const base = pickFrom(initialLeaveForm().state, '2026-10-05');
    const reset = pickTo(changePart(base.state, 'first_half').state, '2026-10-09');
    expect(reset.resetNote).toBe(true);
    const after = changePart(reset.state, 'full_day');
    expect(after.resetNote).toBe(false);
  });

  it('the note clears on the next date change', () => {
    const base = pickFrom(initialLeaveForm().state, '2026-10-05');
    const reset = pickTo(changePart(base.state, 'first_half').state, '2026-10-09');
    const after = pickFrom(reset.state, '2026-10-06');
    expect(after.resetNote).toBe(false);
  });
});

describe('range invariants', () => {
  it('From moved past a picked To clears the To (never an inverted range)', () => {
    const base = pickTo(pickFrom(initialLeaveForm().state, '2026-10-05').state, '2026-10-09');
    expect(base.state.to).toBe('2026-10-09');
    const moved = pickFrom(base.state, '2026-10-12');
    expect(moved.state.to).toBeNull();
    expect(moved.state.from).toBe('2026-10-12');
    expect(moved.resetNote).toBe(false);
  });

  it('Clear on To returns half-day options and part stays full_day (no silent restore)', () => {
    const base = pickTo(pickFrom(initialLeaveForm().state, '2026-10-05').state, '2026-10-09');
    const cleared = clearTo(base.state);
    expect(cleared.state.to).toBeNull();
    expect(cleared.state.part).toBe('full_day'); // was reset by the range; stays
    expect(cleared.resetNote).toBe(false);
    expect(isHalfDayVisible(cleared.state)).toBe(true);
  });

  it('Clear on To==From keeps the half-day that still applies to the single date', () => {
    const base = pickFrom(initialLeaveForm().state, '2026-10-05');
    const half = changePart(base.state, 'first_half');
    const withSameTo = pickTo(half.state, '2026-10-05');
    const cleared = clearTo(withSameTo.state);
    expect(cleared.state.to).toBeNull();
    expect(cleared.state.part).toBe('first_half');
  });

  it('pickTo without From is a defensive no-op (the row is gated on From)', () => {
    const step = pickTo(initialLeaveForm().state, '2026-10-05');
    expect(step.state.from).toBeNull();
    expect(step.state.to).toBeNull();
  });
});

describe('the wire-body matrix (endDate omitted on single; part omitted on full_day)', () => {
  it('single date + full_day ⇒ both omitted', () => {
    const state = pickFrom(initialLeaveForm().state, '2026-10-05').state;
    expect(buildWireDates(state)).toEqual({ startDate: '2026-10-05' });
  });

  it('single date + first_half ⇒ part present, endDate still omitted', () => {
    const state = changePart(
      pickFrom(initialLeaveForm().state, '2026-10-05').state,
      'first_half',
    ).state;
    expect(buildWireDates(state)).toEqual({ startDate: '2026-10-05', part: 'first_half' });
  });

  it('a range ⇒ endDate present, part absent (a range is always full_day)', () => {
    const state = pickTo(
      pickFrom(initialLeaveForm().state, '2026-10-05').state,
      '2026-10-09',
    ).state;
    expect(buildWireDates(state)).toEqual({
      startDate: '2026-10-05',
      endDate: '2026-10-09',
    });
  });

  it('To == From normalizes to single-date on the wire (no same-day duplicate)', () => {
    const state = pickTo(
      pickFrom(initialLeaveForm().state, '2026-10-05').state,
      '2026-10-05',
    ).state;
    expect(buildWireDates(state)).toEqual({ startDate: '2026-10-05' });
  });

  it('no From ⇒ no wire body at all (the submit gate never calls it)', () => {
    expect(buildWireDates(initialLeaveForm().state)).toBeNull();
  });

  it('buildApplyBody adds the trimmed reason to the normalized dates', () => {
    const state = changePart(
      pickFrom(initialLeaveForm().state, '2026-10-05').state,
      'second_half',
    ).state;
    expect(buildApplyBody(state, 'Family event')).toEqual({
      startDate: '2026-10-05',
      part: 'second_half',
      reason: 'Family event',
    });
  });
});

describe('count copy — the server integer, verbatim (review F1: no 0.5)', () => {
  it('1 ⇒ singular', () => {
    expect(workingDaysCopy(1)).toBe('1 working day');
  });

  it('any other integer ⇒ plural, interpolated verbatim', () => {
    expect(workingDaysCopy(0)).toBe('0 working days');
    expect(workingDaysCopy(2)).toBe('2 working days');
    expect(workingDaysCopy(62)).toBe('62 working days');
  });
});

describe('the picker floor — today − 7 (LEAVE_MAX_PAST_DAYS mirror)', () => {
  it('subtracts exactly 7 days within a month', () => {
    expect(minSelectableDate('2026-10-20')).toBe('2026-10-13');
    expect(LEAVE_MIN_PAST_DAYS).toBe(7);
  });

  it('rolls back across a month boundary', () => {
    expect(minSelectableDate('2026-03-05')).toBe('2026-02-26');
  });

  it('rolls back across a year boundary', () => {
    expect(minSelectableDate('2026-01-03')).toBe('2025-12-27');
  });

  it('handles a short month (March − 7 from the 3rd)', () => {
    expect(minSelectableDate('2026-03-03')).toBe('2026-02-24');
  });
});
