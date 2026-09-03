/**
 * Technician-side job data — a technician's own assigned jobs (Today) and
 * their completed/past ones (History).
 *
 * Both are empty for now: the technician jobs endpoints arrive with the
 * offline-sync epic. Uses `ApiJob` (the API row shape) — swap these for real
 * API calls once those stories land.
 */
import type { ApiJob } from '../jobs/types';

/** Live list for the "Today" tab. Empty until the technician jobs API exists. */
export const TODAY_JOBS: ApiJob[] = [];

/** Live list for the "History" tab. Empty until the technician jobs API exists. */
export const JOB_HISTORY: ApiJob[] = [];