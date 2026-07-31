/**
 * services/resources/jobs.ts
 * ──────────────────────────
 * Jobs for the signed-in owner's tenant.
 *
 * Only `POST /jobs` is wired so far, so this is a plain function object on the
 * shared `apiClient` (same shape as `customers.ts`) rather than an
 * `ApiService<T>` — promote it once the list/detail endpoints land.
 *
 * Owner-only: a technician JWT gets 403. Rejects with `ApiError` on failure.
 */
import { apiClient } from '../api/apiClient';

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
 * The created job, as returned by `201`.
 *
 * Only `id` is modelled: the full response shape isn't documented, and callers
 * currently need nothing else. Widen this rather than casting at call sites
 * once a job detail screen needs the rest.
 */
export interface CreatedJob {
  id: string;
}

/**
 * `POST /jobs` — creates a job for the owner's tenant.
 *
 * Documented failures, all surfaced as `ApiError`:
 *   400 company not set up · 403 technician JWT · 422 validation error
 */
async function create(input: CreateJobRequest): Promise<CreatedJob> {
  const res = await apiClient.post<CreatedJob>('/jobs', input);
  return res.data;
}

export const jobService = {
  create,
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
