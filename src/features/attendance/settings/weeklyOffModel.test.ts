/**
 * Direct unit tests for the weeklyOffModel pure helpers (Story 15-6,
 * 15-6 review: the model's own branches were previously exercised only
 * through the screens, so the unsorted-input and impossible-date edges
 * had no owner).
 *
 *  - describeDays: 0/1/2/3+-day sets, UNSORTED input, duplicates and
 *    out-of-range values (the helper must clean up after its callers).
 *  - isValidIsoDate: shape vs calendar reality ("2026-02-31" is not a
 *    date), leap years, garbage.
 *  - isWeeklyOffDirty: untouched is never dirty; day-set divergence;
 *    date-only divergence; tap-then-revert returns to not-dirty.
 *  - isWeeklyOffSaveDisabled: empty is SAVEABLE (the BE clears/works-all
 *    contract), all-7 blocks (FR-18), bad date blocks, in-flight blocks.
 */
import type { IsoWeekday } from '../../../services';
import {
  describeDays,
  isOverrideSaveDisabled,
  isValidIsoDate,
  isWeeklyOffDirty,
  isWeeklyOffSaveDisabled,
  SUNDAY,
  viewDays,
} from './weeklyOffModel';

describe('describeDays', () => {
  it('empty set reads "All days working"', () => {
    expect(describeDays([])).toBe('All days working');
  });

  it('a single day reads "{Day} only"', () => {
    expect(describeDays([5])).toBe('Fri only');
    expect(describeDays([SUNDAY])).toBe('Sun only');
  });

  it('two days read "{A} + {B}"', () => {
    expect(describeDays([6, 7])).toBe('Sat + Sun');
    expect(describeDays([4, 5])).toBe('Thu + Fri');
  });

  it('three or more days read as a comma list with "+ last"', () => {
    expect(describeDays([5, 6, 7])).toBe('Fri, Sat + Sun');
    expect(describeDays([1, 2, 3, 4, 5])).toBe('Mon, Tue, Wed, Thu + Fri');
  });

  it('accepts UNSORTED input and still emits ascending day order', () => {
    expect(describeDays([7, 5])).toBe('Fri + Sun');
    expect(describeDays([6, 1, 4, 3])).toBe('Mon, Wed, Thu + Sat');
  });

  it('drops duplicates and out-of-range values instead of crashing', () => {
    // The view days come off the wire; a defensive clean-up beats an
    // "undefined only" subtitle (DAY_LABELS[-1] would be undefined).
    expect(describeDays([5, 5])).toBe('Fri only');
    // `unknown` first: 0 and 9/99 are deliberately out of IsoWeekday's
    // 1-7 range — malformed wire input is the thing under test.
    expect(describeDays([0, 5, 9] as unknown as IsoWeekday[])).toBe('Fri only');
    expect(describeDays([0, 99] as unknown as IsoWeekday[])).toBe(
      'All days working',
    );
  });
});

describe('isValidIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(isValidIsoDate('2026-09-27')).toBe(true);
    expect(isValidIsoDate('2028-02-29')).toBe(true); // leap year
  });

  it('rejects impossible calendar dates that match the shape', () => {
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('2027-02-29')).toBe(false); // NOT a leap year
    expect(isValidIsoDate('2026-04-31')).toBe(false); // April has 30
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
  });

  it('rejects non-shape input', () => {
    expect(isValidIsoDate('')).toBe(false);
    expect(isValidIsoDate('2026/09/27')).toBe(false);
    expect(isValidIsoDate('27-09-2026')).toBe(false);
    expect(isValidIsoDate('2026-9-27')).toBe(false);
  });
});

describe('viewDays', () => {
  it('returns the view days, or empty for a null view', () => {
    expect(viewDays({ days: [6, 7], validFrom: '2026-01-01', validTo: null })).toEqual([6, 7]);
    expect(viewDays(null)).toEqual([]);
  });
});

describe('isWeeklyOffDirty', () => {
  const base = {
    hasTouched: true,
    effectiveDateChanged: false,
    canonicalDays: [7] as IsoWeekday[],
  };

  it('an untouched form is never dirty (Sunday preselect stays read-only)', () => {
    expect(
      isWeeklyOffDirty({ ...base, hasTouched: false, workingDays: [6, 7] }),
    ).toBe(false);
  });

  it('a touched day-set divergence is dirty', () => {
    expect(isWeeklyOffDirty({ ...base, workingDays: [6, 7] })).toBe(true);
    expect(isWeeklyOffDirty({ ...base, workingDays: [7] })).toBe(false);
  });

  it('tap-then-revert back to the canonical is NOT dirty', () => {
    expect(isWeeklyOffDirty({ ...base, workingDays: [7] })).toBe(false);
  });

  it('a date-only divergence is dirty', () => {
    expect(
      isWeeklyOffDirty({
        ...base,
        workingDays: [7],
        effectiveDateChanged: true,
      }),
    ).toBe(true);
  });

  it('empty working days vs an empty canonical is NOT dirty (both mean all-working)', () => {
    expect(
      isWeeklyOffDirty({ ...base, workingDays: [], canonicalDays: [] }),
    ).toBe(false);
    // …but diverging FROM a configured set to empty IS dirty (a clear).
    expect(isWeeklyOffDirty({ ...base, workingDays: [] })).toBe(true);
  });
});

describe('isWeeklyOffSaveDisabled', () => {
  const base = { dirty: true, dateValid: true, isSaving: false };

  it('a clean form blocks the save', () => {
    expect(
      isWeeklyOffSaveDisabled({ ...base, dirty: false, workingDays: [7] }),
    ).toBe(true);
  });

  it('an EMPTY day set is SAVEABLE — the BE clears the rule / stores the works-all-week override', () => {
    expect(
      isWeeklyOffSaveDisabled({ ...base, workingDays: [] }),
    ).toBe(false);
  });

  it('all 7 days blocks the save (FR-18: at least one working day remains)', () => {
    expect(
      isWeeklyOffSaveDisabled({
        ...base,
        workingDays: [1, 2, 3, 4, 5, 6, 7],
      }),
    ).toBe(true);
  });

  it('an impossible date blocks the save', () => {
    expect(
      isWeeklyOffSaveDisabled({ ...base, workingDays: [7], dateValid: false }),
    ).toBe(true);
  });

  it('a save already in flight blocks a second one', () => {
    expect(
      isWeeklyOffSaveDisabled({ ...base, workingDays: [7], isSaving: true }),
    ).toBe(true);
  });
});

describe('isOverrideSaveDisabled — the 15-8 add-mode fix', () => {
  // The add sheet's baseline is the visual Sunday preselect, so a set equal
  // to [SUNDAY] is exactly the device-reported dead end: toggle-off→on
  // restored the baseline and the old dirty-vs-baseline gate re-disabled
  // Save forever. Add mode now needs only TOUCHED + valid; edit mode keeps
  // dirty-vs-saved.
  const add = (overrides: Partial<Parameters<typeof isOverrideSaveDisabled>[0]> = {}) =>
    isOverrideSaveDisabled({
      isEdit: false,
      hasTouched: true,
      dirty: false, // a set equal to the baseline is NOT dirty — add mode must not care
      workingDays: [SUNDAY],
      dateValid: true,
      isSaving: false,
      ...overrides,
    });

  it('add mode: untouched is disabled (the Sunday preselect alone is not a save)', () => {
    expect(add({ hasTouched: false })).toBe(true);
  });

  it('add mode: touched + a set EQUAL to the Sunday baseline is ENABLED (the fixed dead end)', () => {
    // Reported on device 2026-09-28: a deliberate Sunday-only override was
    // unsavable because restoring the baseline un-dirtied the form.
    expect(add()).toBe(false);
  });

  it('add mode: touched + empty set is ENABLED (the works-all-week override)', () => {
    expect(add({ workingDays: [] })).toBe(false);
  });

  it('add mode: touched + a diverging set is ENABLED (dirty irrelevant in add mode)', () => {
    expect(add({ dirty: true, workingDays: [6] })).toBe(false);
  });

  it('edit mode: a no-op toggle (not dirty) stays disabled — it must not re-PUT', () => {
    expect(
      add({ isEdit: true, dirty: false, hasTouched: true }),
    ).toBe(true);
  });

  it('edit mode: a real divergence (dirty) enables', () => {
    expect(
      add({ isEdit: true, dirty: true, workingDays: [5, 7] }),
    ).toBe(false);
  });

  it('BOTH modes: an all-7-days set blocks (FR-18)', () => {
    const seven = [1, 2, 3, 4, 5, 6, 7] as IsoWeekday[];
    expect(add({ workingDays: seven })).toBe(true);
    expect(
      add({ isEdit: true, dirty: true, workingDays: seven }),
    ).toBe(true);
  });

  it('BOTH modes: an impossible date blocks', () => {
    expect(add({ dateValid: false })).toBe(true);
    expect(add({ isEdit: true, dirty: true, dateValid: false })).toBe(true);
  });

  it('BOTH modes: a save already in flight blocks', () => {
    expect(add({ isSaving: true })).toBe(true);
    expect(add({ isEdit: true, dirty: true, isSaving: true })).toBe(true);
  });
});
