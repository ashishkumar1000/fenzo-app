/**
 * relativeTime — the coarse bucket ladder, pinned at every bucket boundary
 * with a fixed `nowMs` (the helper's own convention: tests pin time instead
 * of racing the host — same as istDate.test.ts).
 */
import { relativeTime } from './relativeTime';
import { formatIstDateLabel } from './istDate';

const NOW = Date.parse('2026-09-09T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  it.each([
    ['just under a minute reads "Just now"', 59 * 1000, 'Just now'],
    ['the 60s boundary flips to minutes', MIN, '1m ago'],
    ['just under an hour stays minutes', 59 * MIN, '59m ago'],
    ['the 60m boundary flips to hours', HOUR, '1h ago'],
    ['just under a day stays hours', 23 * HOUR, '23h ago'],
    ['the 24h boundary flips to days', DAY, '1d ago'],
    ['just under a week stays days', 6 * DAY, '6d ago'],
    ['the 7d boundary flips to weeks', 7 * DAY, '1w ago'],
    ['just under 4 weeks stays weeks', 27 * DAY, '3w ago'],
  ])('%s', (_name, elapsed, expected) => {
    expect(relativeTime(ago(elapsed as number), NOW)).toBe(expected);
  });

  it('negative elapsed (clock skew, a row that just landed) reads "Just now"', () => {
    expect(relativeTime(ago(-5 * MIN), NOW)).toBe('Just now');
  });

  it('an unparseable timestamp reads "Just now", never NaN', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('Just now');
  });

  it('past 4 weeks it falls back to the IST calendar-date label', () => {
    const iso = ago(28 * DAY);
    // Delegates to the app's one date-label authority...
    expect(relativeTime(iso, NOW)).toBe(formatIstDateLabel(iso));
    // ...never a "Xw ago" past the ladder's own MAX_WEEKS.
    expect(relativeTime(iso, NOW)).not.toContain('w ago');
  });
});