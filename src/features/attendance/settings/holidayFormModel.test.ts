/**
 * Tests for the pure holiday form model behind HolidayFormSheet
 * (Story 15-6): the date validator rejects malformed and roll-over dates,
 * validation flags empty/too-long names, the body builder sends only what
 * the BE needs for each mode (POST body includes date, PATCH omits it —
 * 15-5 made the holiday date immutable on PATCH), and the name is trimmed
 * before submit.
 */
import {
  buildHolidaySubmitBody,
  emptyHolidayForm,
  formFromHoliday,
  hasHolidayFormErrors,
  HOLIDAY_NAME_MAX,
  isValidDateString,
  validateHolidayForm,
} from './holidayFormModel';

describe('isValidDateString', () => {
  it.each([
    ['2026-09-30', true],
    ['2026-12-31', true],
    ['2024-02-29', true], // leap year
    ['2026-01-01', true],
  ])('accepts %s', (value, expected) => {
    expect(isValidDateString(value)).toBe(expected);
  });

  it.each([
    ['', false],
    ['2026-9-30', false],   // missing zero-padding
    ['2026/09/30', false],   // wrong separator
    ['30-09-2026', false],   // wrong order
    ['2026-02-30', false],   // impossible day
    ['2026-13-01', false],   // impossible month
    ['2026-02-29', false],   // 2026 is NOT a leap year — Feb 29 is impossible
    ['2025-02-29', false],   // non-leap year
    ['abcdefgh', false],
  ])('rejects %s', (value, expected) => {
    expect(isValidDateString(value)).toBe(expected);
  });
});

describe('validateHolidayForm', () => {
  it('flags a missing name', () => {
    const errors = validateHolidayForm({ date: '2026-09-30', name: '' });
    expect(errors.date).toBeUndefined();
    expect(errors.name).toBe('Name is required.');
  });

  it('flags a whitespace-only name (no characters after trim)', () => {
    expect(validateHolidayForm({ date: '2026-09-30', name: '   ' }).name)
      .toBe('Name is required.');
  });

  it('flags a too-long name at the BE ceiling + 1', () => {
    const tooLong = 'x'.repeat(HOLIDAY_NAME_MAX + 1);
    const errors = validateHolidayForm({ date: '2026-09-30', name: tooLong });
    expect(errors.name).toContain(`${HOLIDAY_NAME_MAX} characters`);
  });

  it('padding that trims away keeps a ceiling-length name valid (trim x ceiling boundary)', () => {
    // 15-6 review iteration 1 test gap: validation trims BEFORE the length
    // check, so a name whose TRIMMED length sits exactly at the ceiling is
    // valid even though the raw value exceeds it — the same boundary the
    // counter and maxLength disagree on if trim crept into the wrong place.
    const padded = `  ${'x'.repeat(HOLIDAY_NAME_MAX)}  `;
    expect(padded.length).toBeGreaterThan(HOLIDAY_NAME_MAX);
    expect(validateHolidayForm({ date: '2026-09-30', name: padded }).name)
      .toBeUndefined();
    // One character more after trim tips it over.
    expect(
      validateHolidayForm({ date: '2026-09-30', name: `${padded}x` }).name,
    ).toContain(`${HOLIDAY_NAME_MAX} characters`);
  });

  it('accepts a name at exactly the ceiling', () => {
    const atLimit = 'x'.repeat(HOLIDAY_NAME_MAX);
    expect(validateHolidayForm({ date: '2026-09-30', name: atLimit }).name)
      .toBeUndefined();
  });

  it('flags an invalid date', () => {
    expect(validateHolidayForm({ date: 'not-a-date', name: 'Diwali' }).date)
      .toBe('Pick a valid date.');
    expect(validateHolidayForm({ date: '2026-02-30', name: 'Diwali' }).date)
      .toBe('Pick a valid date.');
  });

  it('returns an empty errors object for a happy-path form', () => {
    expect(validateHolidayForm({ date: '2026-09-30', name: 'Diwali' })).toEqual({});
    expect(hasHolidayFormErrors(validateHolidayForm({ date: '2026-09-30', name: 'Diwali' })))
      .toBe(false);
  });

  it('hasHolidayFormErrors is true if any field failed', () => {
    expect(hasHolidayFormErrors(validateHolidayForm({ date: '2026-09-30', name: '' })))
      .toBe(true);
    expect(hasHolidayFormErrors(validateHolidayForm({ date: 'bad', name: 'X' })))
      .toBe(true);
  });
});

describe('emptyHolidayForm / formFromHoliday', () => {
  it('emptyHolidayForm seeds the date but leaves the name blank', () => {
    expect(emptyHolidayForm('2026-09-30')).toEqual({ date: '2026-09-30', name: '' });
  });

  it('formFromHoliday copies the existing date and name', () => {
    expect(formFromHoliday({ date: '2026-09-30', name: 'Diwali' }))
      .toEqual({ date: '2026-09-30', name: 'Diwali' });
  });
});

describe('buildHolidaySubmitBody', () => {
  it('add mode (POST): includes both date and trimmed name', () => {
    expect(buildHolidaySubmitBody({ date: '2026-09-30', name: '  Diwali  ' }, false))
      .toEqual({ date: '2026-09-30', name: 'Diwali' });
  });

  it('edit mode (PATCH): sends ONLY the trimmed name — date is immutable', () => {
    expect(buildHolidaySubmitBody({ date: '2026-09-30', name: '  Diwali  ' }, true))
      .toEqual({ name: 'Diwali' });
  });

  it('edit mode does not echo the date back even when changed locally', () => {
    // The sheet shows the date read-only, but a caller might still mutate
    // the form — the body builder must NOT leak it.
    expect(buildHolidaySubmitBody({ date: '2027-01-01', name: 'Renamed' }, true))
      .toEqual({ name: 'Renamed' });
  });
});
