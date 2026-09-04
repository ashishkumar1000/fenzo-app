/**
 * `buildTodaySections` — pure grouping for the technician Today tab:
 * fixed section order, `scheduledStart` ascending within each section,
 * empty sections omitted.
 */
import { buildTodaySections } from '../src/features/technicianApp/todaySections';
import type { ApiJob } from '../src/services';

function makeJob(id: string, overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id,
    jobNumber: `JB-2026-${id}`,
    tenantId: 't1',
    customerId: `c-${id}`,
    technicianId: `tech-${id}`,
    serviceLocation: 'Chennai',
    serviceType: 'plumbing',
    scheduledStart: '2026-09-04T04:30:00.000Z',
    scheduledEnd: null,
    status: 'scheduled',
    currentStep: null,
    priority: 'normal',
    requireCompletionPhoto: false,
    description: null,
    notesForTechnician: null,
    createdAt: '2026-09-03T09:00:00Z',
    updatedAt: '2026-09-03T09:00:00Z',
    completedAt: null,
    ...overrides,
  };
}

describe('buildTodaySections', () => {
  it('orders sections In progress → Scheduled → Done today', () => {
    const sections = buildTodaySections([
      makeJob('a', { status: 'completed' }),
      makeJob('b', { status: 'scheduled' }),
      makeJob('c', { status: 'in_progress' }),
    ]);
    expect(sections.map(s => s.title)).toEqual(['IN PROGRESS', 'SCHEDULED', 'DONE TODAY']);
  });

  it('omits empty sections', () => {
    const sections = buildTodaySections([makeJob('a', { status: 'scheduled' })]);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('SCHEDULED');
  });

  it('sorts each section by scheduledStart ascending', () => {
    const sections = buildTodaySections([
      makeJob('late', { status: 'scheduled', scheduledStart: '2026-09-04T10:00:00.000Z' }),
      makeJob('early', { status: 'scheduled', scheduledStart: '2026-09-04T03:00:00.000Z' }),
      makeJob('mid', { status: 'scheduled', scheduledStart: '2026-09-04T07:00:00.000Z' }),
    ]);
    expect(sections[0].data.map(j => j.id)).toEqual(['early', 'mid', 'late']);
  });

  it('returns no sections for an empty day', () => {
    expect(buildTodaySections([])).toEqual([]);
  });

  it('ignores statuses outside the three sections (cancelled)', () => {
    const sections = buildTodaySections([makeJob('x', { status: 'cancelled' })]);
    expect(sections).toEqual([]);
  });
});