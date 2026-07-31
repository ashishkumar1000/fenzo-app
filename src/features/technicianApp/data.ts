/**
 * Technician-side job data — a technician's own assigned jobs (Today) and
 * their completed/past ones (History).
 *
 * Both are empty for now: no `GET` endpoint for a technician's jobs is
 * documented yet (only `POST /auth/invite` exists on the technician side so
 * far). Reuses the owner-side `Job` type since the shape (customer, status,
 * time, amount) is identical from either side — swap these for real API
 * calls once the endpoints are given, the same way `features/jobs/data.ts`
 * documents doing for the owner's list.
 */
import type { Job } from '../jobs/types';

/** Live list for the "Today" tab. Empty until the jobs API exists. */
export const TODAY_JOBS: Job[] = [];

/** Live list for the "History" tab. Empty until the jobs API exists. */
export const JOB_HISTORY: Job[] = [];
