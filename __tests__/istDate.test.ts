/**
 * istDate util — the hand-built IST day math behind the timeline scopes.
 *
 * jest runs in the host machine's timezone and clock, so every test pins
 * `nowIso` explicitly. `2026-09-04T04:00:00Z` is the anchor: 09:30 IST on
 * 4 Sep 2026. Its IST midnight is `2026-09-03T18:30:00Z` — which is also the
 * day boundary used to prove that two jobs 30 minutes apart can be a whole
 * day apart in overdue terms.
 */
import { daysOverdue, formatIstDateLabel, isSameIstDay, istDayStartMs } from '../src/utils';

const NOW = '2026-09-04T04:00:00Z'; // 09:30 IST, Fri 4 Sep 2026
const IST_MIDNIGHT = '2026-09-03T18:30:00Z'; // 00:00 IST on 4 Sep
const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('istDayStartMs', () => {
  it('returns the IST midnight of the pinned day as an epoch-ms instant', () => {
    expect(istDayStartMs(NOW)).toBe(Date.parse(IST_MIDNIGHT));
  });

  it('advances one IST day per 24h — add multiples of 86_400_000 for fixtures', () => {
    const tomorrow = istDayStartMs(NOW) + MS_PER_DAY;
    expect(new Date(tomorrow).toISOString()).toBe('2026-09-04T18:30:00.000Z');
  });
});

describe('isSameIstDay', () => {
  it('counts any hour of the same IST day as today', () => {
    expect(isSameIstDay('2026-09-03T18:30:00Z', NOW)).toBe(true); // 00:00 IST
    expect(isSameIstDay('2026-09-04T11:00:00Z', NOW)).toBe(true); // 16:30 IST
  });

  it('flips at the 18:30Z boundary, not the UTC midnight', () => {
    expect(isSameIstDay('2026-09-03T18:29:59Z', NOW)).toBe(false); // 23:59:59 IST, 3 Sep
    expect(isSameIstDay('2026-09-03T18:30:00Z', NOW)).toBe(true); // 00:00:00 IST, 4 Sep
  });
});

describe('daysOverdue', () => {
  it('is 0 for anything today, however early', () => {
    expect(daysOverdue(IST_MIDNIGHT, NOW)).toBe(0);
  });

  it('is 1 for yesterday', () => {
    expect(daysOverdue('2026-09-03T10:00:00Z', NOW)).toBe(1);
  });

  it('counts whole IST days, so 23:30 IST yesterday → 1 but 00:00 IST today → 0', () => {
    // These two instants are 30 minutes apart, yet a day apart in IST terms.
    expect(daysOverdue('2026-09-03T18:00:00Z', NOW)).toBe(1); // 23:30 IST, 3 Sep
    expect(daysOverdue('2026-09-03T18:30:00Z', NOW)).toBe(0); // 00:00 IST, 4 Sep
  });

  it('counts a full week and never goes negative for future jobs', () => {
    expect(daysOverdue('2026-08-28T10:00:00Z', NOW)).toBe(7);
    expect(daysOverdue('2026-09-10T10:00:00Z', NOW)).toBe(0); // future → clamped
  });
});

describe('formatIstDateLabel', () => {
  it('omits the year when it matches the pinned now', () => {
    expect(formatIstDateLabel('2026-09-04T04:00:00Z', NOW)).toBe('4 Sep');
  });

  it('appends the year when it differs from the pinned now', () => {
    expect(formatIstDateLabel('2027-09-05T04:00:00Z', NOW)).toBe('5 Sep 2027');
  });

  it('reads the IST wall date, not the UTC date', () => {
    // 2026-09-04T17:00:00Z is 4 Sep UTC but 22:30 IST 4 Sep → "4 Sep";
    // 2026-09-04T19:30:00Z is 4 Sep UTC but 01:00 IST 5 Sep → "5 Sep".
    expect(formatIstDateLabel('2026-09-04T17:00:00Z', NOW)).toBe('4 Sep');
    expect(formatIstDateLabel('2026-09-04T19:30:00Z', NOW)).toBe('5 Sep');
  });
});
