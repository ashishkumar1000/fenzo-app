/**
 * services/resources/enrolments.ts
 * ────────────────────────────────
 * The attendance enrolment roster for the signed-in owner's tenant
 * (Epic 15, Story 15-8 UI over the live 15-7 routes — contract source:
 * fenzit-be `docs/api-contracts.md` → "Attendance enrolments").
 *
 * A plain function object on the shared `apiClient` (same shape as
 * `offices.ts`), not an `ApiService<T>`. Owner-only: a technician JWT gets
 * 403. Rejects with `ApiError` on failure.
 *
 * The list endpoint returns EVERY tenant technician joined with their
 * access state (read from `enrolments.service.ts`'s view) — including
 * invited, never-enrolled people — so the wizard's Employees step can
 * render the whole roster. `attendanceAccess` is carried for contract
 * fidelity but deliberately unread by the FE (15-10 owns the technician
 * surfaces).
 *
 * Deliberately absent: `PUT /attendance/enrolments/:employeeId/office`
 * (reassignment, FR-6) and `startDate` on enable — 15-9 owns the full
 * roster UX (UX-DR9's start-date field); the wizard writes today-dated
 * enrolments only (the server default).
 *
 * Documented failures the FE relies on:
 *   - Every endpoint → 404 `ATTENDANCE_TENANT_NOT_FOUND` for an unknown/
 *     stale tenant. The list itself is 200 `[]` when nobody is enrolled —
 *     never a 404.
 *   - PUT with an unknown employee id → 404 `ATTENDANCE_EMPLOYEE_NOT_FOUND`;
 *     with an unknown office → 404 `ATTENDANCE_OFFICE_NOT_FOUND`.
 *   - PUT with an archived office → 409 `ATTENDANCE_OFFICE_ARCHIVED`
 *     (enrol with a live office) — the row banner + offices refetch branch.
 *   - PUT rejected by the coverage trigger at COMMIT → 422
 *     `ATTENDANCE_ASSIGNMENT_GAP`.
 *   - DELETE is idempotent (a never-enrolled or already-disabled employee
 *     is an unchanged 200).
 */
import { apiClient } from '../api/apiClient';

/**
 * One roster row — `GET /attendance/enrolments`. One row PER tenant
 * technician (not per enrolment): `attendanceStartDate: null` +
 * `officeId: null` is the never-enrolled shape. `officeId`/`officeName`
 * are null while no LIVE (non-archived) assignment covers the enrolment.
 *
 * FIELD SEMANTICS (device-found, story 15-8 — misreading these made the
 * wizard's completion gate unsatisfiable):
 *  - `attendanceEnabled` is the TENANT MODULE flag (`settings.enabled AND
 *    setup_completed_at IS NOT NULL`) — false for EVERY row until setup
 *    completes. It is NOT "this employee is enrolled".
 *  - `attendanceStartDate` is the per-employee enrolment truth (ungated):
 *    `<= today` the enrolment covers today; `> today` upcoming; `null` not
 *    enrolled (null never means "covers today").
 *  - `attendanceAccess` is the module-gated visibility state
 *    ('none'|'upcoming'|'active'|'history_only') — carried but unread by
 *    the FE (15-10 owns the technician surfaces).
 */
export interface EnrolmentOverview {
  employeeId: string;
  employeeName: string;
  phone: string;
  /** TENANT module flag — see the interface docblock; not per-employee. */
  attendanceEnabled: boolean;
  /** Module-gated visibility state — carried but unread by the FE. */
  attendanceAccess: string;
  /**
   * Current enrolment's start (ungated per-employee truth): `<= today`
   * covers today, `> today` upcoming, `null` not enrolled.
   */
  attendanceStartDate: string | null;
  enabledAt: string | null;
  onboardedAt: string | null;
  officeId: string | null;
  officeName: string | null;
}

/** Defensive unwrap of one roster row — a contract break degrades to an
 *  inert row instead of leaking `undefined` into the gate logic. */
function normalizeRow(row: Partial<EnrolmentOverview> | null | undefined): EnrolmentOverview {
  return {
    employeeId: row?.employeeId ?? '',
    employeeName: row?.employeeName ?? '',
    phone: row?.phone ?? '',
    attendanceEnabled: row?.attendanceEnabled === true,
    attendanceAccess: row?.attendanceAccess ?? 'none',
    attendanceStartDate: row?.attendanceStartDate ?? null,
    enabledAt: row?.enabledAt ?? null,
    onboardedAt: row?.onboardedAt ?? null,
    officeId: row?.officeId ?? null,
    officeName: row?.officeName ?? null,
  };
}

/**
 * What the WRITE endpoints return — deliberately NOT a roster row. The BE
 * documents PUT/DELETE as the post-write ACCESS STATE only:
 * `{ attendanceEnabled, attendanceAccess, attendanceStartDate, enabledAt,
 * onboardedAt, officeId, officeName }` — no `employeeId`, `employeeName`
 * or `phone` (the caller already knows whose row it wrote). Treating it as
 * a full row appends a nameless ghost instead of updating the row (found
 * live on device, story 15-8 walkthrough); the hook merges this partial
 * into the matching roster row by the employeeId it called with.
 *
 * The per-employee truth the merge cares about is `attendanceStartDate`
 * (ungated: `<= today` after an enable, `null` after a disable) and
 * `officeId`; `attendanceEnabled` here is the tenant module flag and stays
 * false until setup completes.
 */
export interface EnrolmentWriteState {
  /** TENANT module flag — not per-employee enrolment. */
  attendanceEnabled: boolean;
  attendanceAccess: string;
  /** `<= today` after an enable; `null` after a disable. */
  attendanceStartDate: string | null;
  enabledAt: string | null;
  onboardedAt: string | null;
  officeId: string | null;
  officeName: string | null;
}

/** Defensive unwrap of a write response (same degradation rules). */
function normalizeWriteState(row: Partial<EnrolmentWriteState> | null | undefined): EnrolmentWriteState {
  return {
    attendanceEnabled: row?.attendanceEnabled === true,
    attendanceAccess: row?.attendanceAccess ?? 'none',
    attendanceStartDate: row?.attendanceStartDate ?? null,
    enabledAt: row?.enabledAt ?? null,
    onboardedAt: row?.onboardedAt ?? null,
    officeId: row?.officeId ?? null,
    officeName: row?.officeName ?? null,
  };
}

/** `GET /attendance/enrolments` — the full roster. Defensive: malformed
 *  body → []. */
async function list(): Promise<EnrolmentOverview[]> {
  const res = await apiClient.get<EnrolmentOverview[]>('/attendance/enrolments');
  return Array.isArray(res.data) ? res.data.map(normalizeRow) : [];
}

/**
 * `PUT /attendance/enrolments/:employeeId` with `{ officeId }` — enables
 * attendance and writes the office assignment in one transaction. The
 * start date is omitted so the server default (today) applies; past dates
 * would be clamped anyway (never a 422). Returns the post-write access
 * state (see `EnrolmentWriteState` — identity fields are the caller's).
 * Failures: 404 `ATTENDANCE_EMPLOYEE_NOT_FOUND` /
 * `ATTENDANCE_OFFICE_NOT_FOUND` / `ATTENDANCE_TENANT_NOT_FOUND`, 409
 * `ATTENDANCE_OFFICE_ARCHIVED`, 422 `ATTENDANCE_ASSIGNMENT_GAP`.
 */
async function enable(
  employeeId: string,
  officeId: string,
): Promise<EnrolmentWriteState> {
  const res = await apiClient.put<EnrolmentWriteState>(
    `/attendance/enrolments/${encodeURIComponent(employeeId)}`,
    { officeId },
  );
  return normalizeWriteState(res.data);
}

/**
 * `DELETE /attendance/enrolments/:employeeId` — disables attendance; both
 * ranges clip at today, history stays read-only. Idempotent (200 with the
 * post-disable access state even for a never-enrolled employee). Failures:
 * 404 `ATTENDANCE_EMPLOYEE_NOT_FOUND`, 404 `ATTENDANCE_TENANT_NOT_FOUND`.
 */
async function disable(employeeId: string): Promise<EnrolmentWriteState> {
  const res = await apiClient.delete<EnrolmentWriteState>(
    `/attendance/enrolments/${encodeURIComponent(employeeId)}`,
  );
  return normalizeWriteState(res.data);
}

export const enrolmentsService = {
  list,
  enable,
  disable,
};
