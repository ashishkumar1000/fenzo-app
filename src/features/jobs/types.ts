/**
 * Jobs domain types.
 * Kept local to the feature; promote to `src/types` once a real API/service
 * backs this list.
 */
import type { StatusKey } from '../../theme';

/** Job status shown in the list — maps 1:1 to the Badge status vocabulary. */
export type JobStatus = Exclude<StatusKey, 'neutral'>;

/** Lucide icon name used for the job's service-type glyph. */
export type JobServiceIcon = 'wrench' | 'droplet' | 'snowflake';

export type Job = {
  id: string;
  customerName: string;
  /** Short description of the work, e.g. "AC gas refill + cleaning". */
  description: string;
  serviceIcon: JobServiceIcon;
  status: JobStatus;
  /** Pre-formatted time range or single time, e.g. "2:00 – 4:00 PM". */
  timeLabel: string;
  technicianName: string;
  amount: number;
};

/** Filter chip values shown above the list. 'all' has no Job equivalent. */
export type JobFilter = 'all' | JobStatus;
