/**
 * services/resources/attendanceLeave.ts
 * ─────────────────────────────────────
 * The technician's self-apply leave surface (Story 17-5 over the shipped
 * 17-1..17-4 routes — contract source: fenzit-be `docs/api-contracts.md`
 * → "Attendance me leave", spec-17-5 D7). A plain function object on the
 * shared `apiClient` (the attendanceCheckIn.ts shape).
 *
 *   previewLeave  GET /attendance/me/leave/preview — the FR-12 live
 *                 working-days check. Gate failures and overlap answer
 *                 `200 { ok: false, errorCode, message }` (NOT HTTP
 *                 errors — the FE renders the message inline); only a
 *                 transport/HTTP failure rejects.
 *   applyLeave    POST /attendance/me/leave — the caller owns the
 *                 idempotency key: one fresh UUID v4 per tap, sent as
 *                 `X-Idempotency-Key`. 201 is BOTH outcomes (create and
 *                 replay answer the stored view, same handler) — success
 *                 has exactly one shape.
 *
 * Rejections surface as `ApiError` whose `code` is the error-catalogue
 * string (`LEAVE_INVALID_RANGE`, `LEAVE_OVERLAP`, …) — the exact wire
 * strings the hook branches on (never the message text).
 *
 * Dates stay `YYYY-MM-DD` strings end to end (AD-7 — never `new Date()`).
 */
import { apiClient } from '../api/apiClient';
import type { Paginated } from '../api/pagination';

/** Full day | first half | second half — halves are single-date only. */
export type LeavePart = 'full_day' | 'first_half' | 'second_half';

/** `ok: true` — the range passes validation; counts are server integers. */
export interface LeavePreviewOk {
  ok: true;
  workingDays: number;
  totalDays: number;
  part: string;
  dates: { date: string; isWorkingDay: boolean; kind: string }[];
}

/**
 * `ok: false` — a validation/gate rejection, inline-renderable. The union
 * is the FULL rejection set: the preview gate answers gate failures
 * (incl. NOT_TRACKED) and overlap as `200 { ok: false }`.
 */
export type LeavePreviewErrorCode =
  | 'ATTENDANCE_NOT_TRACKED'
  | 'LEAVE_INVALID_RANGE'
  | 'LEAVE_BEFORE_START_DATE'
  | 'LEAVE_TOO_OLD'
  | 'LEAVE_CHECKED_IN_CONFLICT'
  | 'LEAVE_ALREADY_OFF'
  | 'LEAVE_OVERLAP';

export interface LeavePreviewRejection {
  ok: false;
  errorCode: LeavePreviewErrorCode;
  message: string;
}

export type LeavePreview = LeavePreviewOk | LeavePreviewRejection;

export interface ApplyLeaveBody {
  startDate: string;
  /** Omitted for a single date (the BE defaults startDate). */
  endDate?: string;
  /** Omitted for full_day (the BE DTO defaults it). */
  part?: LeavePart;
  reason: string;
}

export interface ApplyOnBehalfBody {
  employeeId: string;
  startDate: string;
  /** Omitted for a single date (the BE defaults startDate). */
  endDate?: string;
  /** Omitted for full_day (the BE DTO defaults it). */
  part?: LeavePart;
  reason: string;
}

/**
 * The list/write row — the request view plus `employeeName`, which the
 * owner list adds and write responses never carry (wire-truth F5: the
 * envelope is the house `Paginated<T>`).
 */
export type LeaveRequestRow = LeaveRequestView & { employeeName?: string };

/** The request view (list adds `employeeName`; never this shape). */
export interface LeaveRequestView {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  part: LeavePart;
  reason: string;
  status: string;
  workingDays: number;
  totalDays: number;
  createdBy: string;
  createdAt: string;
  dates: { date: string; state: string }[];
}

export const attendanceLeaveService = {
  previewLeave(params: {
    startDate: string;
    endDate?: string;
    part?: LeavePart;
  }): Promise<LeavePreview> {
    return apiClient
      .get<LeavePreview>('/attendance/me/leave/preview', { params })
      .then(res => res.data);
  },

  applyLeave(body: ApplyLeaveBody, idempotencyKey: string): Promise<LeaveRequestView> {
    return apiClient
      .post<LeaveRequestView>('/attendance/me/leave', body, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      })
      .then(res => res.data);
  },

  // --- Story 17-6 (spec D7) — history, owner queue + decisions, on-behalf.

  /**
   * `GET /attendance/me/leave` — the employee's own history, newest first
   * (cursor scope `leave-me-list`). `employeeName` is list-only wire truth
   * and is meaningless on this endpoint (the caller's own name).
   */
  listMyLeave(params: { cursor?: string; limit?: number } = {}): Promise<
    Paginated<LeaveRequestRow>
  > {
    return apiClient
      .get<Paginated<LeaveRequestRow>>('/attendance/me/leave', { params })
      .then(res => res.data);
  },

  /**
   * `GET /attendance/leave` — the owner list. `status` filters the DERIVED
   * status (`'pending'` is the queue; the unfiltered list is the All tab) —
   * cursors are endpoint-scoped (`leave-owner-list`), so a pending cursor
   * replayed against the unfiltered list would answer garbage: the FE keeps
   * per-tab state and never crosses them (spec D1).
   */
  listOwnerLeave(
    params: {
      status?: string;
      employeeId?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<Paginated<LeaveRequestRow>> {
    return apiClient
      .get<Paginated<LeaveRequestRow>>('/attendance/leave', { params })
      .then(res => res.data);
  },

  /**
   * `POST /attendance/leave/:id/approve` — single-tap decision, NO
   * idempotency key (BE D7: state-guarded own-retry — a retry after a
   * lost response answers 200 with the refreshed view, one server event).
   * 409 `LEAVE_NOT_PENDING` = the request moved to a DIFFERENT terminal
   * state under us — the FE's "already handled" sheet (spec D2).
   */
  approveLeave(id: string): Promise<LeaveRequestRow> {
    return apiClient
      .post<LeaveRequestRow>(`/attendance/leave/${encodeURIComponent(id)}/approve`)
      .then(res => res.data);
  },

  /** `POST /attendance/leave/:id/reject` — empty reason is valid (FR-13):
   *  omit the field entirely rather than sending an empty string. */
  rejectLeave(id: string, reason?: string): Promise<LeaveRequestRow> {
    return apiClient
      .post<LeaveRequestRow>(
        `/attendance/leave/${encodeURIComponent(id)}/reject`,
        reason ? { reason } : {},
      )
      .then(res => res.data);
  },

  /**
   * `POST /attendance/leave/on-behalf` — FR-16, born approved (D10). The
   * idempotency key is REQUIRED here (a replayed create must never double
   * a person's leave): one fresh UUID v4 per tap.
   */
  applyOnBehalf(
    body: ApplyOnBehalfBody,
    idempotencyKey: string,
  ): Promise<LeaveRequestRow> {
    return apiClient
      .post<LeaveRequestRow>('/attendance/leave/on-behalf', body, {
        headers: { 'X-Idempotency-Key': idempotencyKey },
      })
      .then(res => res.data);
  },
};
