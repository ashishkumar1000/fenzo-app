/**
 * The scope→chip rule shared by the Jobs screen and the `useJobs` store, so
 * both sides can never drift: the server silently INTERSECTS a caller status
 * filter with a scope's own forced statuses (fenzit-be `jobs.service.ts` —
 * "the FE never sends such combinations"), so an incompatible chip leaking
 * into a scope change must not reach the wire — it would return an empty
 * list, indistinguishable from a genuinely empty scope.
 *
 * Which chip a scope change keeps. Upcoming/Overdue hide the chip row and
 * the server fixes status there, so those scopes always reset to `all`
 * (no status param); History keeps a filter it can still show, otherwise
 * `all`; Today keeps whatever chip is active. Note the round trip: a
 * Today→Upcoming→Today walk loses the chip (Upcoming forces `all`) —
 * accepted, since Upcoming shows no chip row to re-select it.
 */
import type { JobFilter, JobScope } from './types';

/** The chips History can still show (its server statuses, plus `all`). */
export const HISTORY_FILTERS: JobFilter[] = ['all', 'completed', 'cancelled'];

/** The chip to load when switching to `next`, given the chip on screen. */
export function filterForScope(current: JobFilter, next: JobScope): JobFilter {
  if (next === 'today') return current;
  if (next === 'history' && HISTORY_FILTERS.includes(current)) return current;
  return 'all';
}