/**
 * Tests for the day-statuses service (Story 18-3, spec §3 test plan): the
 * exact URL/params of both fetches; the FAIL-CLOSED normalizer (one unknown
 * status word rejects the WHOLE fetch — never a month minus one row);
 * `latestCorrection` staying ABSENT (not null) on uncorrected days; unknown
 * marker words filtered (a marker only drives a tag, so absence is honest);
 * monthRange bounds incl. Feb/leap and 30/31-day months; malformed rows and
 * non-list days reject.
 */
jest.mock('../api/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { apiClient } from '../api/apiClient';
import {
  fetchDayStatuses,
  fetchMyDayStatuses,
  monthRange,
} from './attendanceDayStatus';

const get = apiClient.get as jest.Mock;

function wireRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workDate: '2026-09-14',
    status: 'present',
    lateMinutes: 22,
    isLate: true,
    earlyCheckoutMinutes: null,
    earlyCheckout: false,
    workedMinutes: 488,
    daysWorked: 1,
    leaveCredit: 0,
    workedOnHolidayCredit: 0,
    isWeeklyOff: false,
    holidayName: null,
    isWorkingDay: true,
    officeId: 'o1',
    officeName: 'Andheri',
    checkinAt: '2026-09-14T10:22:00+05:30',
    checkoutAt: '2026-09-14T18:30:00+05:30',
    checkinSource: 'gps',
    checkoutSource: 'gps',
    checkinDistanceM: 42,
    checkoutDistanceM: null,
    markers: ['corrected'],
    // 20-1 — the leave request id the day came from (null = not leave).
    leaveRequestId: null,
    ...overrides,
  };
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — an unconsumed mockResolvedValueOnce
  // would leak into the next test's first fetch.
  jest.resetAllMocks();
});

describe('fetchDayStatuses (owner)', () => {
  it('GETs /attendance/day-statuses with employeeId+from+to and passes rows through', async () => {
    const row = wireRow();
    get.mockResolvedValueOnce({
      data: { employeeId: 'e1', from: '2026-09-01', to: '2026-09-30', today: '2026-09-29', days: [row] },
    });

    const res = await fetchDayStatuses('e1', '2026-09-01', '2026-09-30');

    expect(get).toHaveBeenCalledWith('/attendance/day-statuses', {
      params: { employeeId: 'e1', from: '2026-09-01', to: '2026-09-30' },
    });
    expect(res.employeeId).toBe('e1');
    expect(res.today).toBe('2026-09-29');
    expect(res.days).toHaveLength(1);
    expect(res.days[0]).toEqual(row);
  });

  it('keeps latestCorrection ABSENT on an uncorrected day (never null)', async () => {
    get.mockResolvedValueOnce({
      data: { employeeId: 'e1', from: 'a', to: 'b', today: 't', days: [wireRow()] },
    });

    const res = await fetchDayStatuses('e1', 'a', 'b');

    expect('latestCorrection' in res.days[0]).toBe(false);
  });

  it('passes a carried leaveRequestId through; a non-string one degrades to null', async () => {
    get.mockResolvedValueOnce({
      data: { employeeId: 'e1', from: 'a', to: 'b', today: 't', days: [wireRow({ leaveRequestId: 'lr1' })] },
    });
    const res = await fetchDayStatuses('e1', 'a', 'b');
    expect(res.days[0].leaveRequestId).toBe('lr1');

    get.mockResolvedValueOnce({
      // Adversarial wire: the id arrives as a number, not a string.
      data: { employeeId: 'e1', from: 'a', to: 'b', today: 't', days: [wireRow({ leaveRequestId: 42 })] },
    });
    const res2 = await fetchDayStatuses('e1', 'a', 'b');
    expect(res2.days[0].leaveRequestId).toBeNull();
  });

  it('passes a carried latestCorrection through untouched', async () => {
    const latest = {
      correctedAt: '2026-09-15T09:00:00+05:30',
      actorName: null,
      note: 'Fixed the times',
      oldValue: { status: 'absent', checkinAt: null, checkoutAt: null },
      newValue: { status: null, checkinAt: '2026-09-14T10:22:00+05:30', checkoutAt: null },
    };
    get.mockResolvedValueOnce({
      data: {
        employeeId: 'e1', from: 'a', to: 'b', today: 't',
        days: [wireRow({ latestCorrection: latest })],
      },
    });

    const res = await fetchDayStatuses('e1', 'a', 'b');

    expect(res.days[0].latestCorrection).toEqual(latest);
  });

  it.each([
    'tracking',
    'PRESENT',
    42,
    null,
    undefined,
  ])('FAILS THE WHOLE FETCH on one unknown/missing status word (%p)', async bad => {
    get.mockResolvedValueOnce({
      data: {
        employeeId: 'e1', from: 'a', to: 'b', today: 't',
        days: [wireRow(), wireRow({ workDate: '2026-09-15', status: bad })],
      },
    });

    // Fail-closed: the good row is NOT salvaged — the whole fetch rejects.
    await expect(fetchDayStatuses('e1', 'a', 'b')).rejects.toThrow(
      /unknown or missing status word/,
    );
  });

  it.each([
    ['missing workDate', (r: Record<string, unknown>) => {
      const { workDate: _drop, ...rest } = r;
      return rest;
    }],
    ['malformed workDate', (r: Record<string, unknown>) => ({ ...r, workDate: '2026-9-30' })],
    ['non-string workDate', (r: Record<string, unknown>) => ({ ...r, workDate: 42 })],
  ])('FAILS THE WHOLE FETCH on a bad workDate (%s)', async (_name, mutate) => {
    get.mockResolvedValueOnce({
      data: {
        employeeId: 'e1', from: 'a', to: 'b', today: 't',
        days: [mutate(wireRow({ status: 'present' }))],
      },
    });

    await expect(fetchDayStatuses('e1', 'a', 'b')).rejects.toThrow(
      /missing or malformed workDate/,
    );
  });

  it('filters unknown MARKER words without failing (a tag, not a fact)', async () => {
    get.mockResolvedValueOnce({
      data: {
        employeeId: 'e1', from: 'a', to: 'b', today: 't',
        days: [wireRow({ markers: ['corrected', 'vibes'] })],
      },
    });

    const res = await fetchDayStatuses('e1', 'a', 'b');

    expect(res.days[0].markers).toEqual(['corrected']);
  });

  it('coerces a missing markers array to [] and rejects a non-list days', async () => {
    get.mockResolvedValueOnce({
      data: { employeeId: 'e1', from: 'a', to: 'b', today: 't', days: [wireRow({ markers: null })] },
    });
    const ok = await fetchDayStatuses('e1', 'a', 'b');
    expect(ok.days[0].markers).toEqual([]);

    get.mockResolvedValueOnce({
      data: { employeeId: 'e1', from: 'a', to: 'b', today: 't', days: 'nope' },
    });
    await expect(fetchDayStatuses('e1', 'a', 'b')).rejects.toThrow(
      /not a list/,
    );
  });
});

describe('fetchMyDayStatuses (me)', () => {
  it('GETs /attendance/me/day-statuses with from+to only (identity from the JWT)', async () => {
    get.mockResolvedValueOnce({
      data: { from: '2026-09-01', to: '2026-09-30', today: '2026-09-29', days: [] },
    });

    const res = await fetchMyDayStatuses('2026-09-01', '2026-09-30');

    expect(get).toHaveBeenCalledWith('/attendance/me/day-statuses', {
      params: { from: '2026-09-01', to: '2026-09-30' },
    });
    expect(res.days).toEqual([]);
    expect(res.today).toBe('2026-09-29');
  });

  it('the me path is fail-closed identically', async () => {
    get.mockResolvedValueOnce({
      data: { from: 'a', to: 'b', today: 't', days: [wireRow({ status: 'weekend' })] },
    });

    await expect(fetchMyDayStatuses('a', 'b')).rejects.toThrow(
      /unknown or missing status word/,
    );
  });
});

describe('monthRange — calendar bounds (structurally under the 62 cap)', () => {
  it.each([
    ['2026-01', '2026-01-01', '2026-01-31'],
    ['2026-04', '2026-04-01', '2026-04-30'],
    ['2026-09', '2026-09-01', '2026-09-30'],
    ['2026-12', '2026-12-01', '2026-12-31'],
    ['2026-02', '2026-02-01', '2026-02-28'],
    ['2024-02', '2024-02-01', '2024-02-29'], // leap year
    ['2000-02', '2000-02-01', '2000-02-29'], // 400-rule leap
    ['1900-02', '1900-02-01', '1900-02-28'], // century non-leap
  ])('%s → %s … %s', (yearMonth, from, to) => {
    expect(monthRange(yearMonth)).toEqual({ from, to });
  });

  it.each(['2026-13', '2026-00', '2026-9', '202609', 'september', ''])(
    'throws on a malformed year-month (%p) — a programmer error',
    bad => {
      expect(() => monthRange(bad)).toThrow(/malformed year-month/);
    },
  );
});
