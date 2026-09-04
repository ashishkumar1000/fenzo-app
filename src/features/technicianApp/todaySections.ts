/**
 * buildTodaySections — pure grouping for the technician's Today tab.
 *
 * Sections in fixed order — In progress → Scheduled → Done today — each
 * sorted by `scheduledStart` ascending, empty sections omitted (Done today
 * stays visible when non-empty: honest day count, deliberate product
 * behaviour). Section titles are the eyebrow labels, already UPPERCASE —
 * the one allowed caps use in the design system (tiny letter-spaced
 * eyebrow labels only).
 */
import type { ApiJob } from '../jobs/types';

export interface TodaySection {
  /** Eyebrow label, ready to render — UPPERCASE, letterSpacing applied by the screen. */
  title: string;
  data: ApiJob[];
}

/** Fixed section order: active work first, the day's done jobs last. */
const SECTIONS: { status: ApiJob['status']; title: string }[] = [
  { status: 'in_progress', title: 'IN PROGRESS' },
  { status: 'scheduled', title: 'SCHEDULED' },
  { status: 'completed', title: 'DONE TODAY' },
];

export function buildTodaySections(jobs: ApiJob[]): TodaySection[] {
  return SECTIONS.map(({ status, title }) => ({
    title,
    // ISO timestamps sort chronologically as strings — no Date objects needed.
    data: jobs
      .filter(j => j.status === status)
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
  })).filter(section => section.data.length > 0);
}