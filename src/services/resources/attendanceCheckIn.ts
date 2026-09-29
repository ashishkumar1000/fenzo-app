/**
 * services/resources/attendanceCheckIn.ts
 * ───────────────────────────────────────
 * The technician's check-in/out writes (Story 16-4 over the Epic-16
 * routes — contract source: fenzit-be `docs/api-contracts.md` →
 * "Attendance check-in & check-out").
 *
 * A plain function object on the shared `apiClient` (the attendanceMe.ts
 * shape). The caller (useCheckInOut) owns the idempotency key: one fresh
 * UUID v4 per tap, sent as `X-Idempotency-Key`. Rejections surface as
 * `ApiError` whose `code` is the AD-4 catalogue string
 * (`ATTENDANCE_TOO_FAR`, `ATTENDANCE_RATE_LIMITED`, …) — the exact wire
 * strings the hook branches on.
 *
 * 201 bodies (instants carry the tenant offset — the app formats
 * wall-clock parts and never converts):
 *   check-in  { workDate, checkinAt, lateMinutes, isLate, dayContext }
 *   check-out { workDate, checkinAt, checkoutAt, workedMinutes,
 *               earlyCheckout, earlyCheckoutMinutes, dayContext }
 */
import { apiClient } from '../api/apiClient';
import type { AttendanceLocationFix } from '../location/attendanceLocation';

export interface DayContextFlags {
  isWeeklyOff: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  isWorkingDay: boolean;
}

export interface CheckInResponse {
  workDate: string;
  checkinAt: string;
  lateMinutes: number | null;
  isLate: boolean;
  dayContext: DayContextFlags;
}

export interface CheckOutResponse {
  workDate: string;
  checkinAt: string;
  checkoutAt: string;
  workedMinutes: number;
  earlyCheckout: boolean;
  earlyCheckoutMinutes: number | null;
  dayContext: DayContextFlags;
}

async function postCheck(
  path: '/attendance/me/check-in' | '/attendance/me/check-out',
  fix: AttendanceLocationFix,
  idempotencyKey: string,
): Promise<CheckInResponse | CheckOutResponse> {
  const res = await apiClient.post<CheckInResponse | CheckOutResponse>(path, {
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracyM: fix.accuracyM,
    mocked: fix.mocked,
    provider: fix.provider,
    fixAgeMs: fix.fixAgeMs,
    // confirmLeaveCancel is NOT sent until 17-8 (the FR-9 flag; the server
    // accepts-and-ignores it, but 16-4 has no leave dialog).
  }, {
    headers: { 'X-Idempotency-Key': idempotencyKey },
  });
  return res.data;
}

export const attendanceCheckInService = {
  checkIn: (fix: AttendanceLocationFix, idempotencyKey: string): Promise<CheckInResponse> =>
    postCheck('/attendance/me/check-in', fix, idempotencyKey) as Promise<CheckInResponse>,
  checkOut: (fix: AttendanceLocationFix, idempotencyKey: string): Promise<CheckOutResponse> =>
    postCheck('/attendance/me/check-out', fix, idempotencyKey) as Promise<CheckOutResponse>,
};
