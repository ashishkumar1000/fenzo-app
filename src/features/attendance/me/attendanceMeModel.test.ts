/**
 * Direct unit tests for the 15-10 attendance display model — the pure
 * layer between the wire payloads and the screens:
 *  - formatHhmm12: the wire's `HH:mm` is never rendered verbatim (NFR-5);
 *    midnight/noon are the classic 12-hour conversion traps, and anything
 *    off-vocabulary degrades to null (the row is then omitted entirely).
 *  - formatCutOffCopy: the late threshold ADDS minutes to the rule start
 *    and may wrap past midnight.
 *  - formatWeeklyOffs: ISO weekday numbers, stored unsorted, rendered
 *    Monday-first; out-of-range junk degrades to "No weekly offs".
 *  - shouldShowIntro: the FR-4 gate — active/upcoming AND never onboarded;
 *    a history_only employee's tracking has ended so they are NEVER asked
 *    for location permission (spec finding #5).
 *  - buildPolicyRows: rows without server data are left out, but the
 *    Weekly offs row is ALWAYS present ([] = works all week is a real
 *    answer, not missing data).
 */
import { formatLongDate } from '../../../utils';
import type { AttendanceAccess, AttendanceSummary } from '../../../services';
import {
  buildPolicyRows,
  formatCutOffCopy,
  formatHhmm12,
  formatStartsOnCopy,
  formatTimingRange,
  formatWeeklyOffs,
  shouldShowIntro,
} from './attendanceMeModel';

function access(
  overrides: Partial<AttendanceAccess> = {},
): AttendanceAccess {
  return {
    attendanceEnabled: true,
    attendanceAccess: 'active',
    attendanceStartDate: null,
    attendanceEndedOn: null,
    enabledAt: '2026-09-20T10:00:00Z',
    onboardedAt: null,
    officeId: 'o1',
    officeName: 'HQ',
    ...overrides,
  };
}

function summary(
  overrides: Partial<AttendanceSummary> = {},
): AttendanceSummary {
  return {
    officeId: 'o1',
    officeName: 'HQ',
    startTime: '09:30',
    endTime: '18:00',
    lateCutOffMinutes: 15,
    weeklyOffDays: [6, 7],
    officeLatitude: 19.076,
    officeLongitude: 72.8777,
    officeRadius: 150,
    ...overrides,
  };
}

describe('formatHhmm12', () => {
  it.each([
    ['00:00', '12:00 AM'], // midnight is 12, never 0
    ['00:01', '12:01 AM'],
    ['09:30', '9:30 AM'], // leading zero dropped
    ['11:59', '11:59 AM'],
    ['12:00', '12:00 PM'], // noon is 12 PM
    ['12:01', '12:01 PM'],
    ['18:00', '6:00 PM'],
    ['23:59', '11:59 PM'],
  ])('%s renders as %s', (hhmm, expected) => {
    expect(formatHhmm12(hhmm)).toBe(expected);
  });

  it.each([
    ['9:30'], // not two-digit hour
    ['24:00'], // hour out of range
    ['12:60'], // minute out of range
    ['ab:cd'],
    ['0930'], // missing colon
    ['09:30:00'], // seconds — off vocabulary
    [''],
    [null],
    [undefined],
  ])('%s is malformed → null', (bad) => {
    expect(formatHhmm12(bad as string)).toBeNull();
  });
});

describe('formatTimingRange', () => {
  it('joins both ends with an en dash', () => {
    expect(formatTimingRange('09:30', '18:00')).toBe('9:30 AM – 6:00 PM');
  });

  it.each([
    [null, '18:00'], // missing start
    ['09:30', null], // missing end
    ['9:30', '18:00'], // malformed start — never render the wire value
    ['09:30', '24:00'], // malformed end
  ])('%p–%p renders as null', (start, end) => {
    expect(formatTimingRange(start, end)).toBeNull();
  });
});

describe('formatCutOffCopy', () => {
  it('adds the cut-off minutes to the rule start', () => {
    expect(formatCutOffCopy('09:30', 15)).toBe('Late after 9:45 AM');
  });

  it('a zero-minute cut-off is the start itself (a real rule, not missing)', () => {
    expect(formatCutOffCopy('09:30', 0)).toBe('Late after 9:30 AM');
  });

  it('wraps past midnight', () => {
    expect(formatCutOffCopy('23:50', 20)).toBe('Late after 12:10 AM');
  });

  it.each([
    ['09:30', -1], // negative minutes
    ['09:30', null], // no rule minutes
    [null, 15], // no rule start
    ['9:30', 15], // malformed start
  ])('%p + %p → null', (start, minutes) => {
    expect(formatCutOffCopy(start, minutes as number)).toBeNull();
  });
});

describe('formatWeeklyOffs', () => {
  it('[] means works all week', () => {
    expect(formatWeeklyOffs([])).toBe('No weekly offs');
  });

  it.each([
    [[7], 'Sun'],
    [[1], 'Mon'],
    [[7, 6], 'Sat, Sun'], // stored unsorted, rendered Monday-first
    [[1, 7], 'Mon, Sun'], // Monday sorts before Sunday even when listed last
    [[0, 1, 8], 'Mon'], // out-of-range junk filtered
    [[0, 9], 'No weekly offs'], // all-invalid
  ])('%p renders as %p', (days, expected) => {
    expect(formatWeeklyOffs(days as number[])).toBe(expected);
  });
});

describe('formatStartsOnCopy', () => {
  it('renders the long-form date', () => {
    expect(formatStartsOnCopy('2026-11-01')).toBe(
      `Attendance starts on ${formatLongDate('2026-11-01')}`,
    );
  });

  it.each([null, undefined, '', '2026-1', 'garbage'])(
    '%p (null/short) → null',
    (bad) => {
      expect(formatStartsOnCopy(bad as string)).toBeNull();
    },
  );

  it('a 10+-char non-date string is passed through the shared formatter (never crashes)', () => {
    // The gate is length, not date parsing — formatLongDate passes invalid
    // input through unchanged, so the copy just carries the raw slice.
    expect(formatStartsOnCopy('not-a-date-ish')).toBe(
      `Attendance starts on ${formatLongDate('not-a-date')}`,
    );
  });
});

describe('shouldShowIntro — the FR-4 gate (finding #5)', () => {
  it('active and never onboarded → the intro is owed', () => {
    expect(shouldShowIntro(access({ attendanceAccess: 'active' }))).toBe(true);
  });

  it('upcoming and never onboarded → the intro is owed', () => {
    expect(shouldShowIntro(access({ attendanceAccess: 'upcoming' }))).toBe(true);
  });

  it('history_only is NEVER asked — tracking has ended (finding #5)', () => {
    expect(shouldShowIntro(access({ attendanceAccess: 'history_only' }))).toBe(false);
  });

  it('none is never asked', () => {
    expect(shouldShowIntro(access({ attendanceAccess: 'none' }))).toBe(false);
  });

  it('an access with no state cannot ask', () => {
    expect(shouldShowIntro(access({ attendanceAccess: undefined as never }))).toBe(false);
  });

  it('already onboarded → never again, in every state', () => {
    for (const state of ['none', 'upcoming', 'active', 'history_only'] as const) {
      expect(shouldShowIntro(access({ attendanceAccess: state, onboardedAt: '2026-09-28T09:00:00Z' }))).toBe(false);
    }
  });

  it('no access at all (still unknown) → false', () => {
    expect(shouldShowIntro(null)).toBe(false);
  });
});

describe('buildPolicyRows (the summary card\'s policy rows with chips)', () => {
  it('a null summary has no rows', () => {
    expect(buildPolicyRows(null)).toEqual([]);
  });

  it('the full summary renders four rows in order, each chip derived (2026-10 redesign)', () => {
    expect(buildPolicyRows(summary())).toEqual([
      { key: 'office', label: 'Office', value: 'HQ', chip: 'Assigned branch' },
      { key: 'timings', label: 'Timings', value: '9:30 AM – 6:00 PM', chip: '8h 30m shift' },
      { key: 'cutOff', label: 'Late cut-off', value: 'Late after 9:45 AM', chip: '15m grace' },
      { key: 'weekly', label: 'Weekly offs', value: 'Sat, Sun', chip: '2 days off' },
    ]);
  });

  it('an office-only summary still carries the Weekly offs row ("No weekly offs" is a real answer)', () => {
    expect(
      buildPolicyRows(summary({ startTime: null, endTime: null, lateCutOffMinutes: null, weeklyOffDays: [] })),
    ).toEqual([
      { key: 'office', label: 'Office', value: 'HQ', chip: 'Assigned branch' },
      { key: 'weekly', label: 'Weekly offs', value: 'No weekly offs', chip: null },
    ]);
  });

  it('a missing rule start drops the Timings AND Late cut-off rows, not just the value', () => {
    expect(
      buildPolicyRows(summary({ startTime: null, endTime: '18:00', lateCutOffMinutes: 15 })),
    ).toEqual([
      { key: 'office', label: 'Office', value: 'HQ', chip: 'Assigned branch' },
      { key: 'weekly', label: 'Weekly offs', value: 'Sat, Sun', chip: '2 days off' },
    ]);
  });

  it('a missing office name drops the Office row', () => {
    const rows = buildPolicyRows(summary({ officeName: null }));
    expect(rows.map((r) => r.label)).toEqual(['Timings', 'Late cut-off', 'Weekly offs']);
  });

  it('a non-positive grace window keeps the Late cut-off row, but without the chip', () => {
    const rows = buildPolicyRows(summary({ lateCutOffMinutes: 0 }));
    expect(rows[2].label).toBe('Late cut-off');
    expect(rows[2].chip).toBeNull();
    // The value row stays honest: the START itself is the cut-off.
    expect(rows[2].value).toBe('Late after 9:30 AM');
  });
});
