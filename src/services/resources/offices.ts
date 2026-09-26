/**
 * services/resources/offices.ts
 * ─────────────────────────────
 * Attendance offices for the signed-in owner's tenant (Epic 15, Story 15-4
 * UI over the live 15-3 routes — contract source: fenzit-be
 * `docs/api-contracts.md` → "Attendance offices").
 *
 * A plain function object on the shared `apiClient` (same shape as
 * `customers.ts`), not an `ApiService<T>`. Owner-only: a technician JWT
 * gets 403. Rejects with `ApiError` on failure.
 *
 * Failure notes callers rely on:
 *   - create/update: 409 `ATTENDANCE_OFFICE_NAME_TAKEN` (case-insensitive).
 *   - archive: 409 `ATTENDANCE_OFFICE_ARCHIVE_BLOCKED` whose body carries
 *     `blockers: [{ employeeId, employeeName }]` (the filter forwards every
 *     non-envelope key of the thrown exception into the response body, so
 *     the array arrives at the TOP level of `ApiError.details`).
 *   - update/detail on an archived or unknown office: 404
 *     `ATTENDANCE_OFFICE_NOT_FOUND`.
 */
import { apiClient } from '../api/apiClient';
import type {
  Office,
  OfficeArchiveBlocker,
  OfficeDetail,
} from '../../types/office';

export type { Office, OfficeArchiveBlocker, OfficeDetail, OfficeRule } from '../../types/office';
export type { PickedOfficeLocation } from '../../types/office';

/** Body of `POST /attendance/offices`. Defaults live server-side:
 *  radius 100, cut-off 15, hours 8/4. Times are `HH:mm` 24-hour strings. */
export interface CreateOfficeRequest {
  name: string;
  latitude: number;
  longitude: number;
  radiusM?: number;
  startTime: string;
  endTime: string;
  lateCutoffMinutes?: number;
  fullDayHours?: number;
  halfDayHours?: number;
}

/**
 * Body of `PATCH /attendance/offices/:id`. Profile fields (name/location/
 * radius) apply immediately; the five rule fields travel together through
 * the effective-dated RPC and must be sent as a COMPLETE set (a partial set
 * is a 400, pinned server-side). Any subset may be sent, but never a
 * partial rules set.
 */
export interface UpdateOfficeRequest {
  name?: string;
  latitude?: number;
  longitude?: number;
  radiusM?: number;
  startTime?: string;
  endTime?: string;
  lateCutoffMinutes?: number;
  fullDayHours?: number;
  halfDayHours?: number;
}

/** `GET /attendance/offices` — archived rows hidden unless asked for. */
async function list(includeArchived = false): Promise<Office[]> {
  const res = await apiClient.get<Office[]>('/attendance/offices', {
    params: includeArchived ? { includeArchived: true } : undefined,
  });
  // Defensive: a malformed/missing body must not crash the caller's
  // `.filter()`/`.length` access — same pattern as places.autosuggest.
  return Array.isArray(res.data) ? res.data : [];
}

/** `GET /attendance/offices/:id` — full effective-dated rules history. */
async function get(officeId: string): Promise<OfficeDetail> {
  const res = await apiClient.get<OfficeDetail>(
    `/attendance/offices/${encodeURIComponent(officeId)}`,
  );
  return res.data;
}

/** `POST /attendance/offices` — 201, response carries the seeded rule. */
async function create(input: CreateOfficeRequest): Promise<Office> {
  const res = await apiClient.post<Office>('/attendance/offices', input);
  return res.data;
}

/**
 * `PATCH /attendance/offices/:id` — 200. The response carries the full
 * rules history (it is the detail shape), so the caller can refresh from
 * it without a second request.
 */
async function update(
  officeId: string,
  patch: UpdateOfficeRequest,
): Promise<OfficeDetail> {
  const res = await apiClient.patch<OfficeDetail>(
    `/attendance/offices/${encodeURIComponent(officeId)}`,
    patch,
  );
  return res.data;
}

/**
 * `POST /attendance/offices/:id/archive` — 204. Idempotent server-side
 * (an already-archived office is a no-op success). An archive blocked by
 * assigned employees rejects with the 409 whose `details.blockers` carries
 * the count/rows.
 */
async function archive(officeId: string): Promise<void> {
  await apiClient.post(`/attendance/offices/${encodeURIComponent(officeId)}/archive`);
}

/** Who blocks archiving — AD-24 preview behind the confirm dialog. */
async function archivePreview(
  officeId: string,
): Promise<{ officeId: string; blockers: OfficeArchiveBlocker[] }> {
  const res = await apiClient.get<{ officeId: string; blockers: OfficeArchiveBlocker[] }>(
    `/attendance/offices/${encodeURIComponent(officeId)}/archive/preview`,
  );
  return res.data;
}

export const officesService = {
  list,
  get,
  create,
  update,
  archive,
  archivePreview,
};
