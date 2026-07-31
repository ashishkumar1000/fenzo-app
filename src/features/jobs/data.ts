/**
 * Job data for the Jobs list.
 *
 * `JOBS` is the live source the screen reads — empty until the jobs API is
 * wired up, so the first-run empty state shows.
 */
import type { Job, JobFilter } from './types';

/** Live list. Empty until the owner creates jobs (or the API is wired up). */
export const JOBS: Job[] = [];

export const JOB_FILTERS: { value: JobFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];
