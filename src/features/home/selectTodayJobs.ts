/**
 * selectTodayJobs — which profile job rows the Home dispatch section shows,
 * and in what order.
 *
 * The backend's `jobsScope=today` window returns every status in today's IST
 * day (fenzit-be Story 3-9 parity with `GET /jobs?scope=today`) — completed
 * and cancelled rows included, by design (the window must not lie about its
 * bounds). The section itself only displays active work, so the FE narrows
 * to `scheduled`/`in_progress` here rather than asking the server to
 * pre-filter.
 */
import type { ProfileJob } from '../../services';

export function selectTodayJobs(jobs: ProfileJob[]): ProfileJob[] {
  return jobs
    .filter(job => job.status === 'scheduled' || job.status === 'in_progress')
    .slice()
    .sort((a, b) => {
      const byStart = new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime();
      // A malformed `scheduledStart` parses to NaN, an invalid comparator
      // result (engine-dependent sort behaviour) — treat it as a tie rather
      // than let it escape as NaN.
      if (!Number.isNaN(byStart) && byStart !== 0) return byStart;
      // Same scheduledStart: a job with no end time sorts first.
      if (a.scheduledEnd === b.scheduledEnd) return 0;
      if (a.scheduledEnd === null) return -1;
      if (b.scheduledEnd === null) return 1;
      return 0;
    });
}
