/**
 * jobUrgency — pure logic, no mocks needed.
 *
 * Thresholds and the status gate are the contract the urgency rail renders
 * from (JobCard): >2h calm · 30m–2h near · <30m or past now · settled jobs
 * (completed/cancelled) never urgent.
 */
import { jobUrgency, URGENCY_NEAR_MIN, URGENCY_NOW_MIN } from './urgency';

const NOW = new Date('2026-09-20T10:00:00Z').getTime();

const startInMinutes = (minutes: number) => ({
  scheduledStart: new Date(NOW + minutes * 60_000).toISOString(),
  status: 'scheduled' as const,
});

describe('jobUrgency', () => {
  it('is calm when the start is more than 2 hours away', () => {
    expect(jobUrgency(startInMinutes(URGENCY_NEAR_MIN + 1), NOW)).toBe('calm');
    expect(jobUrgency(startInMinutes(24 * 60), NOW)).toBe('calm');
  });

  it('is near inside 2 hours but before the 30-minute window', () => {
    expect(jobUrgency(startInMinutes(URGENCY_NEAR_MIN), NOW)).toBe('near');
    expect(jobUrgency(startInMinutes(90), NOW)).toBe('near');
    expect(jobUrgency(startInMinutes(URGENCY_NOW_MIN + 1), NOW)).toBe('near');
  });

  it('is now inside 30 minutes and once the slot has started or passed', () => {
    expect(jobUrgency(startInMinutes(URGENCY_NOW_MIN), NOW)).toBe('now');
    expect(jobUrgency(startInMinutes(0), NOW)).toBe('now');
    expect(jobUrgency(startInMinutes(-45), NOW)).toBe('now');
  });

  it('treats an in-progress row by the same time-to-start mapping', () => {
    // In-progress past its slot reads "running behind" — still red, until
    // the job completes and drops out of urgency entirely.
    expect(jobUrgency({ scheduledStart: startInMinutes(-45).scheduledStart, status: 'in_progress' }, NOW)).toBe('now');
    // Not yet due: an early-started job is on track, not urgent.
    expect(jobUrgency({ scheduledStart: startInMinutes(90).scheduledStart, status: 'in_progress' }, NOW)).toBe('near');
  });

  it('never marks a completed or cancelled job urgent, however late it ran', () => {
    const settled = [
      { scheduledStart: startInMinutes(-120).scheduledStart, status: 'completed' as const },
      { scheduledStart: startInMinutes(-120).scheduledStart, status: 'cancelled' as const },
    ];
    for (const job of settled) {
      expect(jobUrgency(job, NOW)).toBeNull();
    }
  });

  it('renders no rail for an unparseable start instead of crashing the list', () => {
    expect(jobUrgency({ scheduledStart: 'not-a-date', status: 'scheduled' }, NOW)).toBeNull();
  });

  it('takes the clock from the caller — same row, later now, later urgency', () => {
    const job = startInMinutes(90); // near at NOW
    expect(jobUrgency(job, NOW - 60 * 60_000)).toBe('calm'); // an hour earlier
    // 90 − 61 = 29 minutes to start — inside the red window, though not yet
    // past it (the case above already covers a passed slot).
    expect(jobUrgency(job, NOW + 61 * 60_000)).toBe('now');
  });
});
