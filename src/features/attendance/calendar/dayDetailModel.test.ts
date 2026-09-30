/**
 * The dayDetailModel additions (Story 18-4, spec §3 test plan): the D1
 * `canCorrectDay` truth table (owner/me × row/null × not_tracked ×
 * future/today/past × today null); the D2 instant builder's exact shape;
 * the CARRIED offset (`tenantOffsetFromCarried` — first non-null
 * `slice(-6)`, skips nulls, the documented IST fallback); and the correct
 * stage's `dayTimesLine` subtitle slot. Pure string surgery — no mocks,
 * and the tests never read a clock.
 */
import type { DayStatusRow } from '../../../services/resources/attendanceDayStatus';
import {
  buildOffsetInstant,
  canCorrectDay,
  dayTimesLine,
  tenantOffsetFromCarried,
} from './dayDetailModel';

function row(overrides: Partial<DayStatusRow> = {}): DayStatusRow {
  return {
    workDate: '2026-09-14',
    status: 'present',
    lateMinutes: null,
    isLate: false,
    earlyCheckoutMinutes: null,
    earlyCheckout: false,
    workedMinutes: null,
    daysWorked: 1,
    leaveCredit: 0,
    workedOnHolidayCredit: 0,
    isWeeklyOff: false,
    holidayName: null,
    isWorkingDay: true,
    officeId: null,
    officeName: null,
    checkinAt: null,
    checkoutAt: null,
    checkinSource: null,
    checkoutSource: null,
    checkinDistanceM: null,
    checkoutDistanceM: null,
    markers: [],
    ...overrides,
  };
}

describe('canCorrectDay — the D1 truth table', () => {
  it.each([
    ['owner + row + tracked + past', 'owner', 'present', '2026-09-14', '2026-09-29', true],
    ['owner + row + tracked + today', 'owner', 'absent', '2026-09-29', '2026-09-29', true],
    ['me scope — never, FR-21', 'me', 'present', '2026-09-14', '2026-09-29', false],
    ['no row (the Not-tracked posture)', 'owner', 'present', null, '2026-09-29', false],
    ['not_tracked — the SAME predicate the BE gates on', 'owner', 'not_tracked', '2026-09-14', '2026-09-29', false],
    ['future day', 'owner', 'present', '2026-09-30', '2026-09-29', false],
    ['today null (pre-first-success)', 'owner', 'present', '2026-09-14', null, false],
  ] as const)('%s', (_name, scope, status, workDate, today, expected) => {
    const day = workDate == null ? null : row({ workDate, status });
    expect(
      canCorrectDay(day, today, scope === 'owner'
        ? { kind: 'owner', employeeId: 'e1' }
        : { kind: 'me' }),
    ).toBe(expected);
  });
});

describe('buildOffsetInstant — the D2 instant shape', () => {
  it('anchors the wall time to the work date with the CARRIED offset, seconds always :00', () => {
    expect(buildOffsetInstant('2026-09-15', '09:00', '+05:30')).toBe(
      '2026-09-15T09:00:00+05:30',
    );
    expect(buildOffsetInstant('2026-09-15', '18:05', '-03:00')).toBe(
      '2026-09-15T18:05:00-03:00',
    );
  });
});

describe('tenantOffsetFromCarried — the offset CARRIES, never derived', () => {
  it('takes the FIRST non-null instant trailing "+HH:MM"', () => {
    expect(tenantOffsetFromCarried(null, '2026-09-15T09:00:00+05:30')).toBe('+05:30');
    expect(tenantOffsetFromCarried('2026-09-15T09:00:00-03:00')).toBe('-03:00');
    expect(
      tenantOffsetFromCarried('2026-09-15T09:00:00+09:00', '2026-09-15T18:00:00+09:00'),
    ).toBe('+09:00');
  });

  it('skips nulls and falls back to the documented IST constant (the 17-7 non-IST caveat)', () => {
    expect(tenantOffsetFromCarried(null, undefined, null)).toBe('+05:30');
    expect(tenantOffsetFromCarried()).toBe('+05:30');
  });

  it('a Z-terminated instant carries "+00:00", never a slice(-6) mangling', () => {
    // The BE normalizes zero offsets to 'Z' (check-in-out.model.ts) —
    // slice(-6) would yield "00:00Z" and 422 every times-mode write.
    expect(tenantOffsetFromCarried('2026-09-15T09:00:00Z')).toBe('+00:00');
    expect(
      tenantOffsetFromCarried(null, '2026-09-15T09:00:00Z'),
    ).toBe('+00:00');
    expect(
      buildOffsetInstant('2026-09-15', '09:00', tenantOffsetFromCarried('2026-09-15T04:00:00Z')),
    ).toBe('2026-09-15T09:00:00+00:00');
  });

  it('a garbage tail (no offset shape) is not carried — falls through', () => {
    expect(tenantOffsetFromCarried('garbage')).toBe('+05:30');
    expect(tenantOffsetFromCarried('garbage', '2026-09-15T09:00:00+05:30')).toBe('+05:30');
  });
});

describe('dayTimesLine — the correct stage\'s subtitle slot', () => {
  it('both instants → "10:22 AM – 6:30 PM" (wall parts, en dash)', () => {
    expect(
      dayTimesLine(
        row({
          checkinAt: '2026-09-14T10:22:00+05:30',
          checkoutAt: '2026-09-14T18:30:00+05:30',
        }),
      ),
    ).toBe('10:22 AM – 6:30 PM');
  });

  it('a lone check-in renders alone', () => {
    expect(dayTimesLine(row({ checkinAt: '2026-09-14T10:22:00+05:30' }))).toBe(
      '10:22 AM',
    );
  });

  it('no parseable instants → null (the omission rule)', () => {
    expect(dayTimesLine(row())).toBeNull();
    expect(dayTimesLine(null)).toBeNull();
    expect(dayTimesLine(row({ checkinAt: 'garbage' }))).toBeNull();
  });
});
