import {
  formatOffsetInstantDate,
  formatOffsetInstantTime,
  formatWorkedMinutes,
} from './offsetInstant';

/**
 * The offset-instant formatters (AD-7/NFR-5). Tester stance: the contract
 * is "render the wall-clock parts, NEVER convert" — a formatter that
 * constructs a Date would silently re-render in the DEVICE's timezone, so
 * these pins hold both the output AND the no-conversion property via
 * offsets the device is not in.
 */

describe('formatOffsetInstantTime — 12-hour wall-clock rendering', () => {
  it('formats a +05:30 instant by its own wall clock (never the device zone)', () => {
    expect(formatOffsetInstantTime('2026-09-29T10:22:00+05:30')).toBe('10:22 AM');
  });

  it('a −08:00 instant renders ITS wall clock (conversion would shift it by hours)', () => {
    expect(formatOffsetInstantTime('2026-09-29T16:10:00-08:00')).toBe('4:10 PM');
  });

  it('a Z (UTC) instant renders UTC wall clock', () => {
    expect(formatOffsetInstantTime('2026-09-29T05:07:00Z')).toBe('5:07 AM');
  });

  it('noon and midnight take the 12, not 0 (12-hour edge)', () => {
    expect(formatOffsetInstantTime('2026-09-29T12:00:00+05:30')).toBe('12:00 PM');
    expect(formatOffsetInstantTime('2026-09-29T00:01:00+05:30')).toBe('12:01 AM');
  });

  it('malformed inputs → null (callers render nothing, never a wrong time)', () => {
    expect(formatOffsetInstantTime(null)).toBeNull();
    expect(formatOffsetInstantTime(undefined)).toBeNull();
    expect(formatOffsetInstantTime('not-a-date')).toBeNull();
    expect(formatOffsetInstantTime('2026-09-29')).toBeNull(); // date only, no time
  });
});

describe('formatOffsetInstantDate — wall-clock date part', () => {
  it('formats day + month name + year from the string', () => {
    expect(formatOffsetInstantDate('2026-09-29T10:22:00+05:30')).toBe('29 Sep 2026');
  });

  it('the −08:00 instant keeps ITS OWN date (the UTC date may differ — conversion would lie)', () => {
    // 2026-09-29T02:00+05:30 = 2026-09-28 in −08:00 land.
    expect(formatOffsetInstantDate('2026-09-29T13:30:00-08:00')).toBe('29 Sep 2026');
    expect(formatOffsetInstantDate('2026-09-30T02:00:00+05:30')).toBe('30 Sep 2026');
  });

  it('malformed inputs → null', () => {
    expect(formatOffsetInstantDate('garbage')).toBeNull();
    expect(formatOffsetInstantDate(null)).toBeNull();
  });
});

describe('formatWorkedMinutes — the "8 h 08 m" contract (PRD example shape)', () => {
  it('whole hours and zero-padded minutes', () => {
    expect(formatWorkedMinutes(488)).toBe('8 h 08 m');
    expect(formatWorkedMinutes(0)).toBe('0 h 00 m');
    expect(formatWorkedMinutes(63)).toBe('1 h 03 m');
  });

  it('sub-minute values truncate (a 90-second day works 1 m, never rounds to 2)', () => {
    expect(formatWorkedMinutes(1.5)).toBe('0 h 01 m');
  });

  it('null/undefined/NaN → null (the open-day card renders nothing, not "0 h 00 m")', () => {
    expect(formatWorkedMinutes(null)).toBeNull();
    expect(formatWorkedMinutes(undefined)).toBeNull();
    expect(formatWorkedMinutes(NaN)).toBeNull();
  });

  it('a corrupt negative clamps to zero, never renders "-2 h"', () => {
    expect(formatWorkedMinutes(-120)).toBe('0 h 00 m');
  });
});
