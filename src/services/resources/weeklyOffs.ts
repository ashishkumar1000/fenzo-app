/**
 * services/resources/weeklyOffs.ts
 * ────────────────────────────────
 * Attendance weekly offs for the signed-in owner's tenant (Epic 15,
 * Story 15-6 UI over the live 15-5 routes — contract source:
 * `fenzit-be/docs/api-contracts.md` → "Weekly offs").
 *
 * A plain function object on the shared `apiClient` (same shape as
 * `offices.ts`), not an `ApiService<T>`. Owner-only: a technician JWT gets
 * 403. Rejects with `ApiError` on failure.
 *
 * Documented failures the FE relies on (15-6 review docblock pass — each
 * code named for the exact surface it can surface on):
 *   - Every endpoint on this resource (all five calls) → 404
 *     `ATTENDANCE_TENANT_NOT_FOUND` for an unknown/stale tenant (the BE
 *     resolves the tenant's today first, fail-loud).
 *   - PUT default with `days = [1..7]` (every weekday) AND the override PUT
 *     with the same body → 422 `ATTENDANCE_NO_WORKING_DAYS`. The FE saves
 *     gate the 7-day selection client-side (Save disabled + inline rule),
 *     so this is the backstop.
 *   - PUT/DELETE override on an unknown employee → 404
 *     `ATTENDANCE_EMPLOYEE_NOT_FOUND`.
 *   - A MALFORMED `effectiveFrom` or `days` payload → 422
 *     `VALIDATION_ERROR`. A past `effectiveFrom` is NOT an error — the RPC
 *     clamps it silently to today per AD-8 (the FE also floors the pickers,
 *     but nothing here rejects a past date).
 */
import { apiClient } from '../api/apiClient';

/** ISO weekday numbers (1=Mon .. 7=Sun) — matches the BE CHECK vocabulary. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** One effective-dated weekly-off selection, bounds as YYYY-MM-DD. */
export interface WeeklyOffView {
  days: IsoWeekday[];
  /** Inclusive start date of the validity range. */
  validFrom: string;
  /** Exclusive end date, or null while the range is open-ended. */
  validTo: string | null;
}

/**
 * GET /attendance/weekly-offs — `default` is the selection valid today
 * (null = all 7 days working, including the never-configured case), `next`
 * the earliest future edit, `history` the full effective-dated range list
 * (ascending, FUTURE rows included — the Upcoming-changes panel reads it),
 * not just the past.
 */
export interface WeeklyOffDefaultResponse {
  default: WeeklyOffView | null;
  next: WeeklyOffView | null;
  history: WeeklyOffView[];
}

/**
 * GET /attendance/weekly-offs/overrides — each employee with an override
 * range, the selection valid today and a pending future edit. Employees
 * without an override row are absent (they read the tenant default).
 */
export interface WeeklyOffOverrideResponse {
  employeeId: string;
  employeeName: string;
  current: WeeklyOffView | null;
  next: WeeklyOffView | null;
}

/** PUT /attendance/weekly-offs and PUT …/overrides/:employeeId body. */
export interface SetWeeklyOffRequest {
  /** Empty array = all 7 days working (clears the rule). */
  days: IsoWeekday[];
  /** Effective date (YYYY-MM-DD). Defaults to today. Past dates are clamped
   *  to today by the RPC (AD-8); the FE also gates past dates client-side. */
  effectiveFrom?: string;
}

/** `GET /attendance/weekly-offs`. Defensive: malformed body → empty view. */
async function getDefault(): Promise<WeeklyOffDefaultResponse> {
  const res = await apiClient.get<WeeklyOffDefaultResponse>(
    '/attendance/weekly-offs',
  );
  return {
    default: res.data?.default ?? null,
    next: res.data?.next ?? null,
    history: Array.isArray(res.data?.history) ? res.data!.history : [],
  };
}

/** `PUT /attendance/weekly-offs` — set/clear the tenant default. */
async function setDefault(
  input: SetWeeklyOffRequest,
): Promise<WeeklyOffDefaultResponse> {
  const res = await apiClient.put<WeeklyOffDefaultResponse>(
    '/attendance/weekly-offs',
    input,
  );
  return {
    default: res.data?.default ?? null,
    next: res.data?.next ?? null,
    history: Array.isArray(res.data?.history) ? res.data!.history : [],
  };
}

/** `GET /attendance/weekly-offs/overrides` — list per-employee overrides. */
async function listOverrides(): Promise<WeeklyOffOverrideResponse[]> {
  const res = await apiClient.get<WeeklyOffOverrideResponse[]>(
    '/attendance/weekly-offs/overrides',
  );
  return Array.isArray(res.data) ? res.data : [];
}

/** Defensive unwrap of a single-override write response (15-6 review):
 *  a contract break degrades to an empty view instead of leaking `undefined`
 *  into row state. */
function normalizeOverride(
  row: WeeklyOffOverrideResponse | null | undefined,
): WeeklyOffOverrideResponse {
  return {
    employeeId: row?.employeeId ?? '',
    employeeName: row?.employeeName ?? '',
    current: row?.current ?? null,
    next: row?.next ?? null,
  };
}

/**
 * `PUT /attendance/weekly-offs/overrides/:employeeId` — set/clear one.
 * Failures: 404 `ATTENDANCE_EMPLOYEE_NOT_FOUND` (unknown employee), 404
 * `ATTENDANCE_TENANT_NOT_FOUND` (stale tenant), 422
 * `ATTENDANCE_NO_WORKING_DAYS` (all 7 days), 422 `VALIDATION_ERROR`
 * (malformed `days`/`effectiveFrom`; a past date clamps silently, AD-8).
 */
async function setOverride(
  employeeId: string,
  input: SetWeeklyOffRequest,
): Promise<WeeklyOffOverrideResponse> {
  const res = await apiClient.put<WeeklyOffOverrideResponse>(
    `/attendance/weekly-offs/overrides/${encodeURIComponent(employeeId)}`,
    input,
  );
  return normalizeOverride(res.data);
}

/**
 * `DELETE /attendance/weekly-offs/overrides/:employeeId?effectiveFrom=`.
 * Idempotent when no covering range exists (the RPC clips without insert).
 * Failures: 404 `ATTENDANCE_EMPLOYEE_NOT_FOUND`, 404
 * `ATTENDANCE_TENANT_NOT_FOUND`, 422 `VALIDATION_ERROR` (malformed date).
 */
async function removeOverride(
  employeeId: string,
  effectiveFrom?: string,
): Promise<WeeklyOffOverrideResponse> {
  const res = await apiClient.delete<WeeklyOffOverrideResponse>(
    `/attendance/weekly-offs/overrides/${encodeURIComponent(employeeId)}`,
    { params: effectiveFrom ? { effectiveFrom } : undefined },
  );
  return normalizeOverride(res.data);
}

export const weeklyOffsService = {
  getDefault,
  setDefault,
  listOverrides,
  setOverride,
  removeOverride,
};
