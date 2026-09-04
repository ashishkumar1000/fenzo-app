/**
 * filterForScope — the shared scope→chip rule behind both the Jobs screen's
 * scope switcher and the `useJobs` store's `setScope`. The server silently
 * intersects a caller status filter with a scope's own forced statuses, so
 * an incompatible chip must never reach the wire. See `scopeFilters.ts`.
 */
import { filterForScope, HISTORY_FILTERS } from '../src/features/jobs/scopeFilters';

describe('HISTORY_FILTERS', () => {
  it('is exactly the chips History offers', () => {
    expect(HISTORY_FILTERS).toEqual(['all', 'completed', 'cancelled']);
  });
});

describe('filterForScope', () => {
  it('Today keeps whatever chip is active', () => {
    expect(filterForScope('completed', 'today')).toBe('completed');
    expect(filterForScope('all', 'today')).toBe('all');
  });

  it('Upcoming and Overdue always reset to all (no chip row there)', () => {
    expect(filterForScope('completed', 'upcoming')).toBe('all');
    expect(filterForScope('in_progress', 'overdue')).toBe('all');
    expect(filterForScope('all', 'upcoming')).toBe('all');
  });

  it('History keeps a chip it can still show', () => {
    expect(filterForScope('completed', 'history')).toBe('completed');
    expect(filterForScope('cancelled', 'history')).toBe('cancelled');
    expect(filterForScope('all', 'history')).toBe('all');
  });

  it('History resets a chip its row hides (scheduled / in_progress)', () => {
    expect(filterForScope('scheduled', 'history')).toBe('all');
    expect(filterForScope('in_progress', 'history')).toBe('all');
  });
});