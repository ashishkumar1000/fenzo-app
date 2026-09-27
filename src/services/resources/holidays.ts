/**
 * services/resources/holidays.ts
 * ──────────────────────────────
 * Attendance holidays for the signed-in owner's tenant (Epic 15,
 * Story 15-6 UI over the live 15-5 routes — contract source:
 * `fenzit-be/docs/api-contracts.md` → "Holidays").
 *
 * A plain function object on the shared `apiClient` (same shape as
 * `offices.ts`), not an `ApiService<T>`. Owner-only: a technician JWT gets
 * 403. Rejects with `ApiError` on failure.
 *
 * Documented failures the FE relies on:
 *   - POST with a date already taken → 409 `ATTENDANCE_HOLIDAY_TAKEN` —
 *     the add sheet surfaces it inline and Save stays disabled until the
 *     user picks a different date.
 *   - PATCH/DELETE on an unknown holiday → 404
 *     `ATTENDANCE_HOLIDAY_NOT_FOUND`.
 *   - 422 `VALIDATION_ERROR` for an impossible calendar date or a name
 *     longer than 80 characters. Past dates are NOT a 422: holidays allow
 *     them (statuses recompute on read) and the FE keeps them selectable.
 */

import { apiClient } from '../api/apiClient';

/** `GET /attendance/holidays` — tenant-scoped, ascending by date. */
export interface Holiday {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  name: string;
}

/** `GET /attendance/holidays/impact?date=` — the AD-24 preview body. */
export interface HolidayImpactResponse {
  date: string;
  affectedEmployees: { employeeId: string; employeeName: string }[];
}

/** `POST /attendance/holidays` body. Date immutable after creation. */
export interface CreateHolidayRequest {
  date: string;
  name: string;
}

/** `PATCH /attendance/holidays/:id` body — name only (date is immutable). */
export interface UpdateHolidayRequest {
  name: string;
}

/** `GET /attendance/holidays`. Defensive: malformed body → []. */
async function list(): Promise<Holiday[]> {
  const res = await apiClient.get<Holiday[]>('/attendance/holidays');
  return Array.isArray(res.data) ? res.data : [];
}

/** `POST /attendance/holidays` — 201 with the seeded row. */
async function create(input: CreateHolidayRequest): Promise<Holiday> {
  const res = await apiClient.post<Holiday>('/attendance/holidays', input);
  return res.data;
}

/** `PATCH /attendance/holidays/:id` — name only. */
async function update(
  id: string,
  patch: UpdateHolidayRequest,
): Promise<Holiday> {
  const res = await apiClient.patch<Holiday>(
    `/attendance/holidays/${encodeURIComponent(id)}`,
    patch,
  );
  return res.data;
}

/** `DELETE /attendance/holidays/:id` — 204 (the BE returns the row on
 *  non-204 paths; FE treats success as `void`). */
async function remove(id: string): Promise<void> {
  await apiClient.delete(`/attendance/holidays/${encodeURIComponent(id)}`);
}

/** `GET /attendance/holidays/impact?date=` — AD-24 preview. */
async function impact(date: string): Promise<HolidayImpactResponse> {
  const res = await apiClient.get<HolidayImpactResponse>(
    '/attendance/holidays/impact',
    { params: { date } },
  );
  return {
    date: res.data?.date ?? date,
    affectedEmployees: Array.isArray(res.data?.affectedEmployees)
      ? res.data!.affectedEmployees
      : [],
  };
}

export const holidaysService = {
  list,
  create,
  update,
  remove,
  impact,
};
