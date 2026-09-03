/**
 * services/resources/jobs.ts
 * ──────────────────────────
 * Jobs for the signed-in owner's tenant: create (`POST /jobs`), the
 * paginated list (`GET /jobs`) and the detail (`GET /jobs/:id`).
 *
 * A plain function object on the shared `apiClient` (same shape as
 * `customers.ts`) rather than an `ApiService<T>`.
 *
 * Owner-only list: a technician JWT gets 403 on `GET /jobs` (the technician
 * variant arrives with the offline-sync epic). Rejects with `ApiError` on
 * failure.
 */
import { apiClient } from '../api/apiClient';
import type { Paginated } from '../api/pagination';

/**
 * The job service-type enum accepted by `POST /jobs`.
 *
 * ⚠️ This is NOT the same vocabulary as a tenant's `serviceCategories` on
 * `/users/me` (`ac_technician`, `plumber`, …). The two overlap on
 * `pest_control` only. See `JOB_SERVICE_TYPE_BY_CATEGORY` in
 * `features/newJob/serviceCategories.ts` for the translation, and note it is
 * lossy — four of the nine signup categories have no counterpart here and
 * collapse to `other`.
 */
export type JobServiceType =
  | 'ac_service'
  | 'ac_installation'
  | 'pest_control'
  | 'plumbing'
  | 'electrical'
  | 'other';

export type JobPriority = 'normal' | 'urgent';

/** Status enum as the API spells it (snake_case), per api-contracts §1. */
export type JobStatusApi = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

/** Workflow steps as the API spells them. Fixed order; fresh job has none. */
export type WorkflowStepApi =
  | 'on_my_way'
  | 'arrived'
  | 'in_progress'
  | 'photos_uploaded'
  | 'signature_captured'
  | 'completed';

export interface CreateJobRequest {
  /** Existing customer UUID. */
  customerId: string;
  /** Where the work happens. Required by the API — never omitted. */
  serviceLocation: string;
  serviceType: JobServiceType;
  /** ISO 8601, UTC (`…Z`). */
  scheduledStart: string;
  /** UUID of the technician who will do the job. Required. */
  technicianId: string;
  /** ISO 8601. Omitted — the form has no duration input. */
  scheduledEnd?: string;
  description?: string;
  /** Defaults to `normal` server-side when omitted. */
  priority?: JobPriority;
  /** Defaults to `false` server-side when omitted. */
  requireCompletionPhoto?: boolean;
  notesForTechnician?: string;
}

/**
 * One job row, exactly as the API returns it — list, create, patch and
 * workflow responses all share this shape.
 *
 * Mirrors the backend's `JobResponse` verbatim: ids only for customer and
 * technician (names are joined client-side), no amount anywhere, and
 * `currentStep` is null until a technician starts the workflow.
 */
export interface ApiJob {
  /** uuid */
  id: string;
  /** Human-readable reference, e.g. "JB-2026-0042". */
  jobNumber: string;
  tenantId: string;
  /** uuid — resolve the display name from the customers store, not here. */
  customerId: string;
  /** uuid — resolve the display name from the roster, not here. */
  technicianId: string;
  serviceLocation: string;
  serviceType: JobServiceType;
  /** ISO 8601, UTC. */
  scheduledStart: string;
  /** ISO 8601, UTC, or null when the form had no end time. */
  scheduledEnd: string | null;
  status: JobStatusApi;
  /** One of `WorkflowStepApi`, or null before the technician starts. */
  currentStep: WorkflowStepApi | null;
  priority: JobPriority;
  requireCompletionPhoto: boolean;
  /** Null when the form left it blank. */
  description: string | null;
  /** Null when the form left it blank. */
  notesForTechnician: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One entry of the job's activity log (`GET /jobs/:id`). `eventType` is a
 * free string on the wire — the known values are listed in
 * api-contracts §4, but anything else must render (raw) rather than crash;
 * see `eventLabel` in `features/jobDetail/eventLabels.ts`.
 */
export interface ActivityLogEntry {
  /** uuid */
  id: string;
  eventType: string;
  /** uuid, or null for system-emitted events (e.g. an auto photo step). */
  actorId: string | null;
  /** Event-specific payload, e.g. previous/new technicianId on `job_reassigned`. */
  metadata: Record<string, unknown> | null;
  /** ISO 8601, UTC. */
  createdAt: string;
}

/** One uploaded file on the job. `type` is the wire enum, never guessed. */
export interface JobAttachment {
  /** uuid */
  id: string;
  type: 'photo' | 'signature';
  /**
   * Presigned R2 read URL — 1-hour TTL, regenerated on every detail call and
   * MAY BE NULL on a transient signing failure. NEVER persist it, never
   * cache it: a refetch is the only retry for a null or expired URL.
   */
  url: string | null;
  /** ISO 8601, UTC. */
  createdAt: string;
}

/** The people embedded in a detail response (names joined server-side). */
export interface JobDetailTechnician {
  id: string;
  name: string;
  countryCode: string;
  phoneNumber: string;
  skills: string[];
}

export interface JobDetailCustomer {
  id: string;
  name: string;
  countryCode: string;
  phoneNumber: string;
  /** Null when the customer was created without one. */
  address: string | null;
  city: string | null;
}

/**
 * The full job as `GET /jobs/:id` returns it — the `ApiJob` row plus the
 * embedded profiles, the activity log (oldest-first) and the attachments
 * (oldest-first, presigned URLs fresh per call).
 */
export interface JobDetail extends ApiJob {
  technician: JobDetailTechnician;
  customer: JobDetailCustomer;
  activityLog: ActivityLogEntry[];
  attachments: JobAttachment[];
}

/** Query accepted by `GET /jobs`. Omitted fields are simply not sent. */
export interface ListJobsQuery {
  /** YYYY-MM-DD. Omit for the server's default (today IST) — never a guess. */
  date?: string;
  /** Repeatable filter; empty/absent means all statuses. */
  status?: JobStatusApi[];
  /** Owner-only filter; silently ignored for a technician role. */
  technicianId?: string;
  /** Opaque cursor from the previous page — pass back verbatim. */
  cursor?: string;
  /** 1–50; server default 50. */
  limit?: number;
}

/**
 * `POST /jobs` — creates a job for the owner's tenant. `201` returns the full
 * row, same shape as list responses.
 *
 * Documented failures, all surfaced as `ApiError`:
 *   400 company not set up · 403 technician JWT · 422 validation error
 */
async function create(input: CreateJobRequest): Promise<ApiJob> {
  const res = await apiClient.post<ApiJob>('/jobs', input);
  return res.data;
}

/**
 * `GET /jobs` — the tenant's jobs for one IST day, newest first.
 *
 * Sort is `createdAt DESC, id DESC` (NOT by scheduledStart), and the day
 * window is `scheduledStart` within the IST date. Empty match is a 200 with
 * `{ data: [], nextCursor: null, hasMore: false }` — not an error.
 *
 * Documented failures, all surfaced as `ApiError`:
 *   400 bad cursor/company · 401 · 422 invalid date/status/limit
 */
async function list(query: ListJobsQuery = {}): Promise<Paginated<ApiJob>> {
  const params: Record<string, unknown> = {};
  if (query.date) params.date = query.date;
  if (query.status?.length) params.status = query.status; // array passed through as-is — the axios instance serializes arrays repeat-style (?status=a&status=b), which is what the backend's query parser expects (bracket style is silently ignored there)
  if (query.technicianId) params.technicianId = query.technicianId;
  if (query.cursor) params.cursor = query.cursor;
  if (query.limit) params.limit = query.limit;
  const res = await apiClient.get<Paginated<ApiJob>>('/jobs', { params });
  return res.data;
}

/**
 * `GET /jobs/:id` — one job with everything: technician and customer
 * profiles (names/phones/skills embedded), the activity log oldest-first,
 * and the attachments with fresh presigned read URLs (1-hour TTL, may be
 * null — a null URL is retried by refetching, never by storing).
 *
 * Owner and the assigned technician only. Documented failures, all surfaced
 * as `ApiError`:
 *   400 malformed uuid/company · 403 technician not assigned · 404 missing
 *   or cross-tenant (cross-tenant is deliberately indistinguishable from
 *   missing — do not leak which)
 */
async function getById(id: string, signal?: AbortSignal): Promise<JobDetail> {
  const res = await apiClient.get<JobDetail>(`/jobs/${id}`, { signal });
  return res.data;
}

export const jobService = {
  create,
  list,
  getById,
};

/**
 * Owner service-category code (`/users/me` → `tenant.serviceCategories`) → the
 * `serviceType` enum this endpoint accepts.
 *
 * Lives here, beside `JobServiceType`, because it encodes the API's contract
 * rather than anything about a screen: the two vocabularies are different and
 * overlap only on `pest_control`, so a selected category can't go on the wire
 * as-is — `plumber` would come back 422.
 *
 * ⚠️ LOSSY. Four categories have no counterpart in the job enum and collapse to
 * `other`: appliance repair, cleaning, carpentry and general maintenance. For a
 * business of that kind *every* job ends up typed `other`, making the field
 * worthless for them. That's the backend enum lagging behind the nine signup
 * categories, not something this map can fix — it needs raising with whoever
 * owns the API. Note also that `ac_installation` is unreachable: no category
 * maps to it.
 */
const JOB_SERVICE_TYPE_BY_CATEGORY: Record<string, JobServiceType> = {
  ac_technician: 'ac_service',
  pest_control: 'pest_control',
  plumber: 'plumbing',
  electrician: 'electrical',
  appliance_repair: 'other',
  cleaning: 'other',
  carpentry: 'other',
  general_maintenance: 'other',
  other: 'other',
};

/**
 * Translates a category code for `POST /jobs`, falling back to `other`.
 *
 * The fallback matters because the backend has never published its category
 * enum, so an unrecognised code is expected rather than exceptional — and a job
 * typed `other` beats a job the owner can't create at all.
 */
export function toJobServiceType(categoryCode: string): JobServiceType {
  return JOB_SERVICE_TYPE_BY_CATEGORY[categoryCode] ?? 'other';
}
