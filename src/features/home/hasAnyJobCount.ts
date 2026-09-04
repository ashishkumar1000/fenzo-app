/**
 * hasAnyJobCount — whether the account has any job at all, from the
 * `/users/me` dashboard counts.
 *
 * Extracted from HomeScreen's setup-complete check (Story 1.5) so the
 * first-run rule can be unit-tested without mounting the screen. The five
 * buckets are mutually exclusive (three IST day-buckets over active jobs +
 * the all-time completed/cancelled totals), so "any > 0" is exactly
 * "the account has at least one job".
 */
import type { JobCounts } from '../../services';

export function hasAnyJobCount(jobCounts: JobCounts): boolean {
  return (
    jobCounts.today > 0 ||
    jobCounts.upcoming > 0 ||
    jobCounts.overdue > 0 ||
    jobCounts.completed > 0 ||
    jobCounts.cancelled > 0
  );
}
