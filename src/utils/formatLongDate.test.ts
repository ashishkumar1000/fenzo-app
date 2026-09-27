import { formatLongDate } from './formatLongDate';

describe('formatLongDate', () => {
  it.each([
    ['2026-09-30', 'Wed, 30 Sept, 2026'],
    ['2026-01-01', 'Thu, 1 Jan, 2026'],
    ['2027-03-14', 'Sun, 14 Mar, 2027'],
  ])('pins the literal en-IN output for %s', (input, expected) => {
    expect(formatLongDate(input)).toBe(expected);
  });

  it('passes non-ISO input through unchanged', () => {
    expect(formatLongDate('not a date')).toBe('not a date');
    expect(formatLongDate('')).toBe('');
  });

  it('is stable across the midnight roll-over (noon construction)', () => {
    // Any local timezone: 2026-12-25 must still read Friday in IST terms.
    expect(formatLongDate('2026-12-25')).toBe('Fri, 25 Dec, 2026');
  });
});