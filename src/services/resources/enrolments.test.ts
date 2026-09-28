/**
 * Tests for the enrolments service (Story 15-8): the exact URL/method/body
 * each call builds (with `encodeURIComponent` on the employee path param),
 * the defensive row normalization (a contract break degrades to an inert
 * row — empty strings, strict-true booleans, 'none' access, null dates —
 * instead of leaking `undefined` into the completion-gate logic), the
 * list's malformed-body fallback to [], and that documented ATTENDANCE_*
 * failures propagate as the thrown `ApiError` unchanged.
 */
jest.mock('../api/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

import { apiClient } from '../api/apiClient';
import { enrolmentsService } from './enrolments';

const get = apiClient.get as jest.Mock;
const put = apiClient.put as jest.Mock;
const remove = apiClient.delete as jest.Mock;

const ENABLED_ROW = {
  employeeId: 'e1',
  employeeName: 'Priya',
  phone: '+919000000000',
  attendanceEnabled: true,
  attendanceAccess: 'active',
  attendanceStartDate: null,
  enabledAt: '2026-09-28T10:00:00Z',
  onboardedAt: '2026-09-28T09:00:00Z',
  officeId: 'o1',
  officeName: 'HQ',
};

// What the WRITE endpoints really return — the access state WITHOUT the
// identity fields (BE contract; mocking a full row here once let a
// nameless-ghost bug ship — the hook merged on a missing employeeId).
const ENABLED_WRITE_STATE = {
  attendanceEnabled: true,
  attendanceAccess: 'active',
  attendanceStartDate: null,
  enabledAt: '2026-09-28T10:00:00Z',
  onboardedAt: '2026-09-28T09:00:00Z',
  officeId: 'o1',
  officeName: 'HQ',
};

describe('enrolmentsService.list', () => {
  it('GETs /attendance/enrolments and returns the rows', async () => {
    get.mockResolvedValueOnce({ data: [ENABLED_ROW] });

    const returned = await enrolmentsService.list();

    expect(get).toHaveBeenCalledWith('/attendance/enrolments');
    expect(returned).toEqual([ENABLED_ROW]);
  });

  it('normalizes a partial row: empty ids, strict-true enabled, null dates/office', async () => {
    get.mockResolvedValueOnce({ data: [{ employeeId: 'e9' }] });

    const returned = await enrolmentsService.list();

    expect(returned).toEqual([
      {
        employeeId: 'e9',
        employeeName: '',
        phone: '',
        attendanceEnabled: false,
        attendanceAccess: 'none',
        attendanceStartDate: null,
        enabledAt: null,
        onboardedAt: null,
        officeId: null,
        officeName: null,
      },
    ]);
  });

  it('falls back to [] when the body is missing/malformed/null (never-enrolled is 200 [], never 404)', async () => {
    get.mockResolvedValueOnce({ data: null });
    await expect(enrolmentsService.list()).resolves.toEqual([]);

    get.mockResolvedValueOnce({ data: {} });
    await expect(enrolmentsService.list()).resolves.toEqual([]);

    get.mockResolvedValueOnce({ data: undefined });
    await expect(enrolmentsService.list()).resolves.toEqual([]);
  });
});

describe('enrolmentsService.enable', () => {
  it('PUTs { officeId } (no startDate — server default is today) and returns the post-write ACCESS STATE (identity stripped)', async () => {
    put.mockResolvedValueOnce({ data: ENABLED_WRITE_STATE });

    const returned = await enrolmentsService.enable('e1', 'o1');

    expect(put).toHaveBeenCalledWith('/attendance/enrolments/e1', {
      officeId: 'o1',
    });
    expect(returned).toEqual(ENABLED_WRITE_STATE);
    expect(returned).not.toHaveProperty('employeeId');
    expect(returned).not.toHaveProperty('employeeName');
  });

  it('degrades a write response missing fields to the inert write state', async () => {
    put.mockResolvedValueOnce({ data: null });

    const returned = await enrolmentsService.enable('e1', 'o1');

    expect(returned).toEqual({
      attendanceEnabled: false,
      attendanceAccess: 'none',
      attendanceStartDate: null,
      enabledAt: null,
      onboardedAt: null,
      officeId: null,
      officeName: null,
    });
  });

  it('percent-encodes the employeeId so path-unsafe ids cannot change the route shape', async () => {
    put.mockResolvedValueOnce({ data: ENABLED_WRITE_STATE });

    await enrolmentsService.enable('e1/with?unsafe', 'o1');

    expect(put).toHaveBeenCalledWith(
      '/attendance/enrolments/e1%2Fwith%3Funsafe',
      { officeId: 'o1' },
    );
  });

  it('propagates 409 ATTENDANCE_OFFICE_ARCHIVED unchanged (the row-banner branch)', async () => {
    const err = {
      status: 409,
      code: 'ATTENDANCE_OFFICE_ARCHIVED',
      message: 'office is archived',
      details: null,
    };
    put.mockRejectedValueOnce(err);

    await expect(enrolmentsService.enable('e1', 'o1')).rejects.toBe(err);
  });
});

describe('enrolmentsService.disable', () => {
  it('DELETEs the employee route (idempotent) and returns the post-disable access state', async () => {
    remove.mockResolvedValueOnce({
      data: { ...ENABLED_WRITE_STATE, attendanceEnabled: false, officeId: null, officeName: null },
    });

    const returned = await enrolmentsService.disable('e1');

    expect(remove).toHaveBeenCalledWith('/attendance/enrolments/e1');
    expect(returned.attendanceEnabled).toBe(false);
    expect(returned.officeId).toBeNull();
  });

  it('percent-encodes the employeeId', async () => {
    remove.mockResolvedValueOnce({ data: ENABLED_WRITE_STATE });

    await enrolmentsService.disable('e2/unsafe?id');

    expect(remove).toHaveBeenCalledWith('/attendance/enrolments/e2%2Funsafe%3Fid');
  });

  it('propagates 404 ATTENDANCE_EMPLOYEE_NOT_FOUND unchanged (the roster-refetch branch)', async () => {
    const err = {
      status: 404,
      code: 'ATTENDANCE_EMPLOYEE_NOT_FOUND',
      message: 'not a tenant member',
      details: null,
    };
    remove.mockRejectedValueOnce(err);

    await expect(enrolmentsService.disable('e1')).rejects.toBe(err);
  });
});
