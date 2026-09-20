/**
 * Urgency model for job lists — how close a job's scheduled start is to
 * now, as a colour level. Pure mapping, no React; unit-testable on its own.
 * Every job-list scope (Today, Upcoming, Overdue) passes a clock; History
 * rows are all settled, so they never qualify.
 *
 * Levels borrow the existing status palettes (the same "no new status
 * colour" rule the Urgent badge follows — DESIGN_SYSTEM.md):
 *   calm → status.done (green)   — more than 2 hours to go: on track.
 *   near → status.scheduled (amber) — inside 2 hours: coming up.
 *   now  → status.cancelled (red)   — inside 30 minutes or the slot has
 *                                    already started / passed: act now.
 *
 * Only ACTIVE jobs qualify. A completed or cancelled row keeps its neutral
 * card — a Done job whose slot has passed must not read as overdue. An
 * in-progress row keeps the same time-to-start mapping: before its slot
 * it's on track, past its slot the red rail reads "running behind" — the
 * work still needs doing until the row completes.
 */
import type { JobStatusApi } from '../../services';

/** The urgency levels a job row can carry; `null` = no rail (inactive job). */
export type JobUrgency = 'calm' | 'near' | 'now' | null;

/** Thresholds in minutes before the scheduled start. */
export const URGENCY_NEAR_MIN = 120; // inside 2 hours → amber
export const URGENCY_NOW_MIN = 30; // inside 30 minutes (or past) → red

export function jobUrgency(
  job: Pick<ApiJobLike, 'scheduledStart' | 'status'>,
  now: number,
): JobUrgency {
  // Completed and cancelled rows are settled history, however late they ran —
  // urgency is about work that still needs doing.
  if (job.status === 'completed' || job.status === 'cancelled') return null;

  const start = new Date(job.scheduledStart).getTime();
  // An unparseable stamp must not crash the list — render no rail and let the
  // time meta row speak for itself.
  if (Number.isNaN(start)) return null;

  const minutesUntil = (start - now) / 60_000;
  // Inclusive upper bounds: exactly 2h is "coming up", exactly 30m is
  // "act now" — at that point the slot is effectively there.
  if (minutesUntil <= URGENCY_NOW_MIN) return 'now';
  if (minutesUntil <= URGENCY_NEAR_MIN) return 'near';
  return 'calm';
}

/** Structural minimum the model needs — keeps callers from over-coupling. */
type ApiJobLike = { scheduledStart: string; status: JobStatusApi };
