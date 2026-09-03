/**
 * Pure display mappings for the jobs feature — API vocabulary in, UI
 * vocabulary out. No React, no side effects; unit-testable on their own.
 */
import type { StatusKey } from '../../theme';
import type { JobServiceType, JobStatusApi } from '../../services';

/**
 * API status → the Badge vocabulary (`StatusKey`). `in_progress` collapses to
 * `progress` — the theme's key for that state, and the one title-case
 * exception in Badge labels ("In Progress").
 */
export function statusToBadge(s: JobStatusApi): Exclude<StatusKey, 'neutral'> {
  const map = {
    scheduled: 'scheduled',
    in_progress: 'progress',
    completed: 'done',
    cancelled: 'cancelled',
  } as const;
  // Fallback for enum drift: an unknown status must not render `undefined`
  // into `<Badge status>` — fall back to the scheduled badge.
  return map[s] ?? 'scheduled';
}

/** Lucide icon name for the job's service-type glyph. */
export function serviceTypeToIcon(t: JobServiceType): 'wrench' | 'droplet' | 'snowflake' {
  return t === 'plumbing' ? 'droplet' : t.startsWith('ac_') ? 'snowflake' : 'wrench';
}

/** Human label for a service type (spec §1 map), used as description fallback. */
const SERVICE_TYPE_LABEL: Record<JobServiceType, string> = {
  ac_service: 'AC service',
  ac_installation: 'AC installation',
  pest_control: 'Pest control',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  other: 'Service',
};

export function serviceTypeLabel(t: JobServiceType): string {
  return SERVICE_TYPE_LABEL[t];
}

/**
 * 12-hour clock label ("2:00 – 4:00 PM"), or a single time when the job has
 * no end.
 */
export function formatTimeLabel(startIso: string, endIso: string | null): string {
  const fmt = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const start = new Date(startIso);
  return endIso ? `${fmt(start)} – ${fmt(new Date(endIso))}` : fmt(start);
}
