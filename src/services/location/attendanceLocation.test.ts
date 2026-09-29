import { getCurrentPosition } from 'react-native-nitro-geolocation';
import {
  captureAttendanceLocation,
} from './attendanceLocation';

/**
 * Story 16-3 — the attendance-only capture (AD-20). Tester stance: the
 * contract is the WIRE SHAPE (mocked undefined → null, fixAgeMs clamped,
 * provider passthrough) and the CLOSED failure union (each member maps to
 * its own employee-facing message — timeout ≠ low accuracy). If the
 * implementation changed but the AD-20 shape did not, these must pass.
 */

const mockGetCurrentPosition = getCurrentPosition as jest.Mock;

jest.mock('react-native-nitro-geolocation', () => ({
  getCurrentPosition: jest.fn(),
}));

function aFix(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    coords: { latitude: 12.97, longitude: 77.59, accuracy: 12 },
    timestamp: Date.now() - 1200,
    mocked: undefined,
    provider: 'fused',
    ...overrides,
  };
}

beforeEach(() => {
  mockGetCurrentPosition.mockClear();
});

describe('captureAttendanceLocation — the AD-20 mapping', () => {
  it('maps a fresh fix to the wire shape; mocked undefined → null (null = not detected)', async () => {
    mockGetCurrentPosition.mockResolvedValueOnce(aFix());

    await expect(captureAttendanceLocation()).resolves.toEqual({
      latitude: 12.97,
      longitude: 77.59,
      accuracyM: 12,
      mocked: null,
      provider: 'fused',
      fixAgeMs: expect.any(Number),
    });
  });

  it('mocked: true passes through as true (the flag rides to the server, which decides)', async () => {
    mockGetCurrentPosition.mockResolvedValueOnce(aFix({ mocked: true }));

    const fix = await captureAttendanceLocation();
    expect(fix.mocked).toBe(true);
  });

  it('fixAgeMs is clamped at 0 (a fix timestamped in the future never goes negative)', async () => {
    mockGetCurrentPosition.mockResolvedValueOnce(
      aFix({ timestamp: Date.now() + 60_000 }),
    );

    const fix = await captureAttendanceLocation();
    expect(fix.fixAgeMs).toBe(0);
  });

  it('a missing provider degrades to null (never undefined on the wire)', async () => {
    mockGetCurrentPosition.mockResolvedValueOnce(aFix({ provider: undefined }));

    const fix = await captureAttendanceLocation();
    expect(fix.provider).toBeNull();
  });
});

describe('captureAttendanceLocation — the closed failure union', () => {
  it.each([
    [3, 'timeout'],
    [1, 'permission'],
    [2, 'unavailable'],
    [4, 'unavailable'],
    [5, 'unavailable'],
    [-1, 'unknown'],
  ])('nitro code %i rejects as %s', async (code, expected) => {
    mockGetCurrentPosition.mockRejectedValueOnce({ code, message: 'x' });

    await expect(captureAttendanceLocation()).rejects.toBe(expected);
  });

  it('an Error-shaped rejection (no code) lands in unknown, never crashes the flow', async () => {
    mockGetCurrentPosition.mockRejectedValueOnce(new Error('boom'));

    await expect(captureAttendanceLocation()).rejects.toBe('unknown');
  });

  it('a fix with missing coordinates rejects as unknown (never submits garbage)', async () => {
    mockGetCurrentPosition.mockResolvedValueOnce(
      aFix({ coords: { latitude: undefined, longitude: 77.59, accuracy: 12 } }),
    );

    await expect(captureAttendanceLocation()).rejects.toBe('unknown');
  });

  it('a fix older than the server stale window pre-rejects LOCALLY as stale — no doomed submission', async () => {
    mockGetCurrentPosition.mockResolvedValueOnce(
      aFix({ timestamp: Date.now() - 40_000 }),
    );

    await expect(captureAttendanceLocation()).rejects.toBe('stale');
    // The pre-reject means exactly ONE native call — the flow stops before
    // the network, where a 422 would arrive with no attempt row and no
    // employee-visible feedback.
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1);
  });
});
