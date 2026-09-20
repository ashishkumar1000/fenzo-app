/**
 * services/resources/reports.ts
 * ────────────────────────────
 * Owner PDF reports (Epic 12, stories 12-2 + 12-6): queue a report request
 * (`POST /reports`), read the history list (`GET /reports`) and poll one
 * request's status (`GET /reports/:id`).
 *
 * Generation is ASYNC by design — the POST only queues the row; the status
 * and history endpoints are how the UI watches it turn `ready`. A `ready`
 * status response carries a FRESH short-lived presigned R2 URL minted per
 * request (never stored, never cached client-side — refetch before every
 * open). A `failed` request is a normal 200 row with `error.code`, not an
 * HTTP error.
 *
 * A plain function object on the shared `apiClient` (same shape as
 * `jobs.ts`). Create carries a caller-minted `X-Idempotency-Key` (fresh per
 * submit — the interceptor replays a stored response per key for 24h, so a
 * reused key would silently skip queueing a second report). Rejects with
 * `ApiError` on failure. Documented failures:
 *   create  400 REPORT_RANGE_TOO_LARGE / REPORT_TOO_MANY_TECHNICIANS /
 *           VALIDATION_ERROR · 429 REPORT_IN_FLIGHT_LIMIT
 *   retry   404 (unknown id or another company's) · 409 REPORT_NOT_RETRYABLE
 *           (row not in the failed state) · 429 REPORT_IN_FLIGHT_LIMIT
 *   status  404 (unknown id or another company's) · 500 REPORT_PRESIGN_FAILED
 */
import { apiClient } from '../api/apiClient';
import type { Paginated } from '../api/pagination';

/** The request state machine (fenzit-be `report-status.enum.ts`). */
export type ReportRequestStatus = 'queued' | 'generating' | 'ready' | 'failed';

/** The only report type in the registry today (story 12-5). */
export const TECHNICIAN_JOB_ACTIVITY_TYPE = 'technician_job_activity';

/** Body for `POST /reports`. `reportType` defaults to the first registered
 *  report server-side; `technicianIds` absent/empty = all technicians. */
export interface CreateReportRequest {
  reportType?: string;
  /** IST calendar dates, `YYYY-MM-DD`, inclusive. */
  startDate: string;
  endDate: string;
  technicianIds?: string[] | null;
}

/** `POST /reports` response — the row is queued, not generated. */
export interface CreateReportResponse {
  id: string;
  status: ReportRequestStatus;
  createdAt: string;
}

/** One history-list row (`GET /reports`). */
export interface ReportListItem {
  id: string;
  reportType: string;
  range: { startDate: string; endDate: string };
  /** Selected technician count; null = all technicians of the company. */
  technicianCount: number | null;
  status: ReportRequestStatus;
  /** Present only on a `failed` row — stable engine error code. */
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** `GET /reports/:id` — when `ready`, `file.url` is a fresh presigned URL. */
export interface ReportStatusResponse {
  id: string;
  reportType: string;
  params: { startDate: string; endDate: string; technicianIds: string[] };
  status: ReportRequestStatus;
  createdAt: string;
  completedAt: string | null;
  file?: { url: string; sizeBytes: number; filename: string };
  error?: { code: string };
}

async function createReport(
  body: CreateReportRequest,
  idemKey: string,
): Promise<CreateReportResponse> {
  const res = await apiClient.post<CreateReportResponse>('/reports', body, {
    headers: { 'X-Idempotency-Key': idemKey },
  });
  return res.data;
}

async function listReports(cursor?: string): Promise<Paginated<ReportListItem>> {
  const res = await apiClient.get<Paginated<ReportListItem>>('/reports', {
    params: cursor ? { cursor } : undefined,
  });
  return res.data;
}

async function getReportStatus(id: string): Promise<ReportStatusResponse> {
  const res = await apiClient.get<ReportStatusResponse>(`/reports/${id}`);
  return res.data;
}

/**
 * `POST /reports/:id/retry` (story 12-7) — re-queues a FAILED request in
 * place; the SAME row regenerates (no duplicate history row). Fresh
 * idempotency key per tap, same rule as create. The row re-enters the
 * ordinary queued → generating → ready polling flow.
 */
async function retryReport(
  id: string,
  idemKey: string,
): Promise<CreateReportResponse> {
  const res = await apiClient.post<CreateReportResponse>(
    `/reports/${id}/retry`,
    undefined,
    { headers: { 'X-Idempotency-Key': idemKey } },
  );
  return res.data;
}

export const reportService = {
  createReport,
  listReports,
  getReportStatus,
  retryReport,
};