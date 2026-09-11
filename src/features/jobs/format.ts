/**
 * Pure display mappings for the jobs feature — API vocabulary in, UI
 * vocabulary out. No React, no side effects; unit-testable on their own.
 */
import type { StatusKey } from '../../theme';
import type { JobStatusApi } from '../../services';

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

/**
 * 12-hour clock label ("2:00 – 4:00 PM"), or a single time when the job has
 * no end.
 */
export function formatTimeLabel(startIso: string, endIso: string | null): string {
  const fmt = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const start = new Date(startIso);
  return endIso ? `${fmt(start)} – ${fmt(new Date(endIso))}` : fmt(start);
}
