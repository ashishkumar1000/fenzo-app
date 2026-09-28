/**
 * Tests for the attendance setup service (Story 15-8): the exact
 * URL/method/body each call builds, the defensive normalization of the
 * shared `SetupState` (a malformed body must never crash the wizard's
 * `started`/`setupCompletedAt` checks), and that documented ATTENDANCE_*
 * failures propagate as the thrown `ApiError` unchanged.
 */
jest.mock('../api/apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

import { apiClient } from '../api/apiClient';
import { attendanceSetupService } from './attendanceSetup';

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;

const FULL_STATE = {
  started: true,
  currentStep: 'weekly_off',
  setupCompletedAt: null,
  enabled: false,
};

describe('attendanceSetupService.getSetup', () => {
  it('GETs /attendance/setup and returns the normalized state', async () => {
    get.mockResolvedValueOnce({ data: FULL_STATE });

    const returned = await attendanceSetupService.getSetup();

    expect(get).toHaveBeenCalledWith('/attendance/setup');
    expect(returned).toEqual(FULL_STATE);
  });

  it('degrades a null body to the never-started state', async () => {
    get.mockResolvedValueOnce({ data: null });

    await expect(attendanceSetupService.getSetup()).resolves.toEqual({
      started: false,
      currentStep: null,
      setupCompletedAt: null,
      enabled: false,
    });
  });

  it('degrades wrong-typed booleans (only a strict true counts as true)', async () => {
    get.mockResolvedValueOnce({
      data: { started: 'yes', enabled: 'sure', currentStep: null, setupCompletedAt: null },
    });

    await expect(attendanceSetupService.getSetup()).resolves.toEqual({
      started: false,
      currentStep: null,
      setupCompletedAt: null,
      enabled: false,
    });
  });
});

describe('attendanceSetupService.startSetup', () => {
  it('POSTs /attendance/setup with NO body (the idempotent start/resume RPC)', async () => {
    post.mockResolvedValueOnce({ data: FULL_STATE });

    const returned = await attendanceSetupService.startSetup();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/attendance/setup');
    expect(returned).toEqual(FULL_STATE);
  });

  it('normalizes a body missing fields (200-resume echo)', async () => {
    post.mockResolvedValueOnce({ data: { started: true } });

    await expect(attendanceSetupService.startSetup()).resolves.toEqual({
      started: true,
      currentStep: null,
      setupCompletedAt: null,
      enabled: false,
    });
  });
});

describe('attendanceSetupService.saveSetupStep', () => {
  it('PATCHes /attendance/setup with the typed step payload (no stringly-typed shapes)', async () => {
    patch.mockResolvedValueOnce({ data: FULL_STATE });

    const returned = await attendanceSetupService.saveSetupStep('employees');

    expect(patch).toHaveBeenCalledWith('/attendance/setup', {
      currentStep: 'employees',
    });
    expect(returned).toEqual(FULL_STATE);
  });
});

describe('attendanceSetupService.completeSetup', () => {
  it('POSTs /attendance/setup/complete with no body', async () => {
    post.mockResolvedValueOnce({
      data: {
        started: true,
        currentStep: null,
        setupCompletedAt: '2026-09-28T10:00:00Z',
        enabled: true,
      },
    });

    await expect(attendanceSetupService.completeSetup()).resolves.toEqual({
      started: true,
      currentStep: null,
      setupCompletedAt: '2026-09-28T10:00:00Z',
      enabled: true,
    });
    expect(post).toHaveBeenCalledWith('/attendance/setup/complete');
  });
});

describe('attendanceSetupService error contracts', () => {
  it('PATCH propagates 404 ATTENDANCE_SETUP_NOT_STARTED unchanged', async () => {
    const err = {
      status: 404,
      code: 'ATTENDANCE_SETUP_NOT_STARTED',
      message: 'no progress row',
      details: null,
    };
    patch.mockRejectedValueOnce(err);

    await expect(attendanceSetupService.saveSetupStep('timings')).rejects.toBe(
      err,
    );
  });

  it('PATCH propagates 409 ATTENDANCE_SETUP_ALREADY_COMPLETED unchanged', async () => {
    const err = {
      status: 409,
      code: 'ATTENDANCE_SETUP_ALREADY_COMPLETED',
      message: 'setup completed',
      details: null,
    };
    patch.mockRejectedValueOnce(err);

    await expect(attendanceSetupService.saveSetupStep('timings')).rejects.toBe(
      err,
    );
  });

  it('POST start propagates 409 ATTENDANCE_SETUP_ALREADY_COMPLETED unchanged', async () => {
    const err = {
      status: 409,
      code: 'ATTENDANCE_SETUP_ALREADY_COMPLETED',
      message: 'setup completed',
      details: null,
    };
    post.mockRejectedValueOnce(err);

    await expect(attendanceSetupService.startSetup()).rejects.toBe(err);
  });

  it('complete propagates 422 ATTENDANCE_SETUP_INCOMPLETE unchanged', async () => {
    const err = {
      status: 422,
      code: 'ATTENDANCE_SETUP_INCOMPLETE',
      message: 'gates unmet',
      details: null,
    };
    post.mockRejectedValueOnce(err);

    await expect(attendanceSetupService.completeSetup()).rejects.toBe(err);
  });
});
