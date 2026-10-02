/**
 * Tests for the technician's own attendance service (Story 15-10): the
 * exact URL/method each call builds, and the defensive unwraps the module
 * owns — a malformed ACCESS body degrades to `none` (the tab then renders
 * hidden and the next refresh corrects it), a malformed SUMMARY body
 * degrades to nulls and a sorted, number-only `weeklyOffDays` list, and
 * strict-typed fields (strict-true `attendanceEnabled`, string-only dates)
 * never leak `undefined` into the feature layer.
 *
 * normalizeAccess/normalizeSummary are private — every case drives them
 * through the service functions with a mocked apiClient, the same
 * convention as `enrolments.test.ts`.
 */
jest.mock('../api/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { apiClient } from '../api/apiClient';
import { attendanceMeService } from './attendanceMe';
import type { AttendanceAccess } from './attendanceMe';

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

function accessRow(
  overrides: Partial<AttendanceAccess> = {},
): AttendanceAccess {
  return {
    attendanceEnabled: true,
    attendanceAccess: 'active',
    attendanceStartDate: '2026-10-01',
    attendanceEndedOn: null,
    enabledAt: '2026-09-20T10:00:00Z',
    onboardedAt: null,
    officeId: 'o1',
    officeName: 'HQ',
    ...overrides,
  };
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — an unconsumed mockRejectedValueOnce
  // would leak into the next test's first fetch.
  jest.resetAllMocks();
});

describe('attendanceMeService.getAccess', () => {
  it('GETs /attendance/me/access and returns a valid row unchanged', async () => {
    const row = accessRow();
    get.mockResolvedValueOnce({ data: row });

    const returned = await attendanceMeService.getAccess();

    expect(get).toHaveBeenCalledWith('/attendance/me/access');
    expect(returned).toEqual(row);
  });

  it.each(['none', 'upcoming', 'active', 'history_only'] as const)(
    'lets the documented %r state through untouched',
    async (state) => {
      get.mockResolvedValueOnce({ data: accessRow({ attendanceAccess: state }) });

      const returned = await attendanceMeService.getAccess();

      expect(returned.attendanceAccess).toBe(state);
    },
  );

  it('degrades a malformed access VALUE ("ACTIVE", unknown words, missing) to "none"', async () => {
    for (const badValue of ['ACTIVE', 'tracking', 1, null, undefined]) {
      get.mockResolvedValueOnce({ data: accessRow({ attendanceAccess: badValue as never }) });

      const returned = await attendanceMeService.getAccess();

      expect(returned.attendanceAccess).toBe('none');
    }
  });

  it('degrades a garbage/null body to the inert all-none row (never a crash)', async () => {
    for (const body of [null, undefined, 'nope', 42]) {
      get.mockResolvedValueOnce({ data: body });

      await expect(attendanceMeService.getAccess()).resolves.toEqual({
        attendanceEnabled: false,
        attendanceAccess: 'none',
        attendanceStartDate: null,
        attendanceEndedOn: null,
        enabledAt: null,
        onboardedAt: null,
        officeId: null,
        officeName: null,
      });
    }
  });

  it('coerces the fields strictly: only strict-true enabled, only string ids/dates survive', async () => {
    get.mockResolvedValueOnce({
      data: {
        attendanceEnabled: 'true', // truthy but not === true
        attendanceAccess: 'upcoming',
        attendanceStartDate: 20261001, // number, not string
        attendanceEndedOn: 20260831, // number, not string
        enabledAt: null,
        onboardedAt: undefined,
        officeId: 12,
        officeName: {},
      },
    });

    const returned = await attendanceMeService.getAccess();

    expect(returned).toEqual({
      attendanceEnabled: false,
      attendanceAccess: 'upcoming',
      attendanceStartDate: null,
      attendanceEndedOn: null,
      enabledAt: null,
      onboardedAt: null,
      officeId: null,
      officeName: null,
    });
  });

  it('19-6: passes attendanceEndedOn through and degrades an ABSENT field (older BE) to null', async () => {
    get.mockResolvedValueOnce({
      data: accessRow({ attendanceAccess: 'history_only', attendanceEndedOn: '2026-08-31' }),
    });
    await expect(attendanceMeService.getAccess()).resolves.toMatchObject({
      attendanceAccess: 'history_only',
      attendanceEndedOn: '2026-08-31',
    });

    const { attendanceEndedOn: _kept, ...older } = accessRow();
    get.mockResolvedValueOnce({ data: older });
    const returned = await attendanceMeService.getAccess();
    expect(returned.attendanceEndedOn).toBeNull();
  });

  it('propagates a documented failure (403 for non-technicians) unchanged', async () => {
    const err = { status: 403, code: 'FORBIDDEN', message: 'not a technician', details: null };
    get.mockRejectedValueOnce(err);

    await expect(attendanceMeService.getAccess()).rejects.toBe(err);
  });
});

describe('attendanceMeService.recordOnboarding', () => {
  it('POSTs /attendance/me/onboarding with no body and returns the timestamp', async () => {
    post.mockResolvedValueOnce({ data: { onboardedAt: '2026-09-28T09:00:00Z' } });

    const returned = await attendanceMeService.recordOnboarding();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/attendance/me/onboarding');
    expect(post.mock.calls[0]).toHaveLength(1); // no request body — first write wins server-side
    expect(returned).toEqual({ onboardedAt: '2026-09-28T09:00:00Z' });
  });

  it('a body without a string onboardedAt degrades to null (replays answer the ORIGINAL timestamp, but a broken one is not fatal)', async () => {
    for (const bad of [undefined, 42, {}, null]) {
      post.mockResolvedValueOnce({ data: { onboardedAt: bad } });

      await expect(attendanceMeService.recordOnboarding()).resolves.toEqual({
        onboardedAt: null,
      });
    }
  });

  it('a null body degrades to null too', async () => {
    post.mockResolvedValueOnce({ data: null });

    await expect(attendanceMeService.recordOnboarding()).resolves.toEqual({
      onboardedAt: null,
    });
  });

  it('propagates a failure unchanged (the intro keeps its inline error)', async () => {
    const err = { status: 0, code: 'NETWORK_ERROR', message: 'offline', details: null };
    post.mockRejectedValueOnce(err);

    await expect(attendanceMeService.recordOnboarding()).rejects.toBe(err);
  });
});

describe('attendanceMeService.getSummary', () => {
  it('GETs /attendance/me/summary and returns a valid payload unchanged', async () => {
    const payload = {
      officeId: 'o1',
      officeName: 'HQ',
      startTime: '09:30',
      endTime: '18:00',
      lateCutOffMinutes: 15,
      weeklyOffDays: [6, 7],
    };
    get.mockResolvedValueOnce({ data: payload });

    const returned = await attendanceMeService.getSummary();

    expect(get).toHaveBeenCalledWith('/attendance/me/summary');
    expect(returned).toEqual({ ...payload, officeLatitude: null, officeLongitude: null, officeRadius: null, today: undefined, todayRecord: undefined });
  });

  it('weeklyOffDays keeps only numbers and sorts NUMERICALLY (not lexicographically)', async () => {
    get.mockResolvedValueOnce({
      data: {
        weeklyOffDays: [10, 2, '6', null, 7], // strings/nulls dropped; 2 < 7 < 10 numerically
      },
    });

    const returned = await attendanceMeService.getSummary();

    expect(returned.weeklyOffDays).toEqual([2, 7, 10]);
  });

  it('a non-array weeklyOffDays degrades to []', async () => {
    for (const bad of [null, undefined, 'none', { day: 7 }]) {
      get.mockResolvedValueOnce({ data: { weeklyOffDays: bad } });

      const returned = await attendanceMeService.getSummary();

      expect(returned.weeklyOffDays).toEqual([]);
    }
  });

  it('non-finite lateCutOffMinutes and non-string times degrade to null', async () => {
    get.mockResolvedValueOnce({
      data: {
        startTime: 930, // number, not HH:mm
        endTime: null,
        lateCutOffMinutes: Infinity,
      },
    });

    const returned = await attendanceMeService.getSummary();

    expect(returned.startTime).toBeNull();
    expect(returned.endTime).toBeNull();
    expect(returned.lateCutOffMinutes).toBeNull();
  });

  it('a valid finite lateCutOffMinutes (including 0) survives', async () => {
    get.mockResolvedValueOnce({ data: { lateCutOffMinutes: 0 } });

    const returned = await attendanceMeService.getSummary();

    expect(returned.lateCutOffMinutes).toBe(0);
  });

  it('a garbage/null body degrades to the honest empty summary', async () => {
    get.mockResolvedValueOnce({ data: null });

    await expect(attendanceMeService.getSummary()).resolves.toEqual({
      officeId: null,
      officeName: null,
      startTime: null,
      endTime: null,
      lateCutOffMinutes: null,
      weeklyOffDays: [],
      officeLatitude: null,
      officeLongitude: null,
      officeRadius: null,
      today: undefined,
      todayRecord: undefined,
    });
  });

  it('a numeric officeRadius passes through; non-finite degrades to null (the prescreen input)', async () => {
    get.mockResolvedValueOnce({ data: { officeRadius: 150 } });
    expect((await attendanceMeService.getSummary()).officeRadius).toBe(150);

    get.mockResolvedValueOnce({ data: { officeRadius: 0 } });
    expect((await attendanceMeService.getSummary()).officeRadius).toBe(0);

    for (const bad of [Number.NaN, Infinity, '150', null]) {
      get.mockResolvedValueOnce({ data: { officeRadius: bad } });
      expect((await attendanceMeService.getSummary()).officeRadius).toBeNull();
    }
  });

  it('propagates a failure unchanged', async () => {
    const err = { status: 500, code: 'SERVER_ERROR', message: 'boom', details: null };
    get.mockRejectedValueOnce(err);

    await expect(attendanceMeService.getSummary()).rejects.toBe(err);
  });
});

describe('attendanceMeService.getSummary — the 17-8 leave facts on today (strict whitelist)', () => {
  const baseToday = {
    date: '2026-09-29',
    isWeeklyOff: false,
    isHoliday: false,
    holidayName: null,
    isWorkingDay: true,
  };

  it.each([
    ['pending', 'full_day'],
    ['approved', 'full_day'],
    ['approved', 'first_half'],
    ['approved', 'second_half'],
  ] as const)(
    'passes the in-domain %s/%s pair through untouched (whitelist membership is what keeps the fields alive)',
    async (leaveState, leavePart) => {
      get.mockResolvedValueOnce({ data: { today: { ...baseToday, leaveState, leavePart } } });

      const returned = await attendanceMeService.getSummary();

      expect(returned.today).toEqual({ ...baseToday, leaveState, leavePart });
    },
  );

  it('an ABSENT leaveState (a pre-17-8 backend) normalizes to null — the legacy payload never asks', async () => {
    get.mockResolvedValueOnce({ data: { today: baseToday } });

    const returned = await attendanceMeService.getSummary();

    expect(returned.today).toEqual({ ...baseToday, leaveState: null, leavePart: null });
  });

  it('no live leave (nulls on the wire) stays null; out-of-domain words degrade to null (dialog-less; the 409 fallback is the net)', async () => {
    get.mockResolvedValueOnce({
      data: { today: { ...baseToday, leaveState: null, leavePart: null } },
    });
    expect((await attendanceMeService.getSummary()).today).toEqual({
      ...baseToday,
      leaveState: null,
      leavePart: null,
    });

    get.mockResolvedValueOnce({
      data: {
        today: { ...baseToday, leaveState: 'cancelled' as never, leavePart: 42 as never },
      },
    });
    expect((await attendanceMeService.getSummary()).today).toEqual({
      ...baseToday,
      leaveState: null,
      leavePart: null,
    });
  });
});
