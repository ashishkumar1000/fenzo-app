/**
 * Tests for the edit-job model helpers: the patch diff, the schedule-window
 * pre-validation and the save-error classification. Pure functions — no RN
 * rendering involved.
 */
import type { ApiError, JobDetail } from '../../services';
import {
  buildPatch,
  EDIT_STARTED_MESSAGE,
  PAST_SLOT_MESSAGE,
  pastSlotError,
  resolveSaveError,
  SAVE_FAILED_MESSAGE,
  scheduleWindowError,
  TECHNICIAN_GONE_MESSAGE,
  type EditJobDraft,
} from './editJobModel';

const BASE_JOB: JobDetail = {
  id: 'job-1',
  jobNumber: 'JB-2026-0042',
  tenantId: 'tenant-1',
  customerId: 'customer-1',
  technicianId: 'tech-1',
  serviceLocation: '12 MG Road, Bengaluru',
  serviceType: 'ac_service',
  scheduledStart: '2026-09-04T10:00:00.000Z',
  scheduledEnd: '2026-09-04T12:00:00.000Z',
  status: 'scheduled',
  currentStep: null,
  priority: 'normal',
  requireCompletionPhoto: false,
  description: 'AC not cooling',
  notesForTechnician: 'Gate code 1234',
  createdAt: '2026-09-01T06:00:00.000Z',
  updatedAt: '2026-09-01T06:00:00.000Z',
  technician: {
    id: 'tech-1',
    name: 'Suresh Kumar',
    countryCode: '+91',
    phoneNumber: '9876543210',
    skills: ['ac_technician'],
  },
  customer: {
    id: 'customer-1',
    name: 'Anita Rao',
    countryCode: '+91',
    phoneNumber: '9123456780',
    address: null,
    city: null,
  },
  activityLog: [],
  attachments: [],
};

/** A draft that mirrors BASE_JOB exactly — no change anywhere. */
function makeDraft(overrides: Partial<EditJobDraft> = {}): EditJobDraft {
  return {
    description: 'AC not cooling',
    scheduledStart: new Date('2026-09-04T10:00:00.000Z'),
    notesForTechnician: 'Gate code 1234',
    priority: 'normal',
    technicianId: 'tech-1',
    ...overrides,
  };
}

function apiError(overrides: Partial<ApiError>): ApiError {
  return { status: 0, code: 'REQUEST_ERROR', message: 'boom', ...overrides };
}

describe('buildPatch', () => {
  it('returns null when nothing changed', () => {
    expect(buildPatch(BASE_JOB, makeDraft())).toBeNull();
  });

  it('sends description only when it actually changed', () => {
    expect(buildPatch(BASE_JOB, makeDraft({ description: 'AC leaking water' }))).toEqual({
      description: 'AC leaking water',
    });
  });

  it('omits an emptied description so the stored value survives (API cannot clear)', () => {
    expect(buildPatch(BASE_JOB, makeDraft({ description: '' }))).toBeNull();
  });

  it('sends a description typed into an empty one', () => {
    const job = { ...BASE_JOB, description: null };
    expect(buildPatch(job, makeDraft({ description: 'Outdoor unit' }))).toEqual({
      description: 'Outdoor unit',
    });
  });

  it('trims whitespace and skips a description that only differs by it', () => {
    expect(buildPatch(BASE_JOB, makeDraft({ description: '  AC not cooling  ' }))).toBeNull();
    expect(buildPatch(BASE_JOB, makeDraft({ description: '  AC leaking  ' }))).toEqual({
      description: 'AC leaking',
    });
  });

  it('sends notesForTechnician only when changed', () => {
    expect(
      buildPatch(BASE_JOB, makeDraft({ notesForTechnician: 'Bring a ladder' })),
    ).toEqual({ notesForTechnician: 'Bring a ladder' });
    expect(buildPatch(BASE_JOB, makeDraft({ notesForTechnician: '' }))).toBeNull();
  });

  it('sends priority only when flipped', () => {
    expect(buildPatch(BASE_JOB, makeDraft({ priority: 'urgent' as const }))).toEqual({
      priority: 'urgent',
    });
    expect(buildPatch(BASE_JOB, makeDraft({ priority: 'normal' }))).toBeNull();
  });

  it('normalizes the schedule to ISO and skips an unchanged slot even when the stored ISO has no milliseconds', () => {
    const job = { ...BASE_JOB, scheduledStart: '2026-09-04T10:00:00Z' };
    // Same instant, different string shapes — must not count as a change.
    expect(buildPatch(job, makeDraft({ scheduledStart: new Date('2026-09-04T10:00:00Z') }))).toBeNull();

    const changed = buildPatch(
      job,
      makeDraft({ scheduledStart: new Date('2026-09-05T11:30:00Z') }),
    );
    expect(changed).toEqual({ scheduledStart: '2026-09-05T11:30:00.000Z' });
  });

  it('sends technicianId on reassign but keeps the prior technician on deselect', () => {
    expect(buildPatch(BASE_JOB, makeDraft({ technicianId: 'tech-2' }))).toEqual({
      technicianId: 'tech-2',
    });
    // Deselecting (null) cannot clear the assignment — omit it entirely.
    expect(buildPatch(BASE_JOB, makeDraft({ technicianId: null }))).toBeNull();
  });

  it('assembles several changed fields into one patch', () => {
    const patch = buildPatch(
      BASE_JOB,
      makeDraft({ priority: 'urgent', technicianId: 'tech-2', notesForTechnician: 'Ring the bell' }),
    );
    expect(patch).toEqual({
      priority: 'urgent',
      technicianId: 'tech-2',
      notesForTechnician: 'Ring the bell',
    });
  });
});

describe('pastSlotError', () => {
  it('blocks a rescheduled slot in the past', () => {
    const patch = { scheduledStart: new Date(Date.now() - 60_000).toISOString() };
    expect(pastSlotError(patch)).toBe(PAST_SLOT_MESSAGE);
  });

  it('accepts a future slot', () => {
    expect(pastSlotError({ scheduledStart: new Date(Date.now() + 60_000).toISOString() })).toBeNull();
  });

  it('only fires when the slot changed (a past job stays savable for other fields)', () => {
    expect(pastSlotError({ priority: 'urgent' })).toBeNull();
    expect(pastSlotError({ status: 'cancelled' })).toBeNull();
  });
});

describe('scheduleWindowError', () => {
  it('blocks a start pushed past the stored end', () => {
    const patch = { scheduledStart: '2026-09-04T13:00:00.000Z' };
    expect(scheduleWindowError(patch, BASE_JOB)).toBe(
      "End time can't be before start time",
    );
  });

  it('blocks an end pulled before the stored start', () => {
    const patch = { scheduledEnd: '2026-09-04T09:00:00.000Z' };
    expect(scheduleWindowError(patch, BASE_JOB)).toBe(
      "End time can't be before start time",
    );
  });

  it('accepts a valid one-sided edit in both directions', () => {
    expect(scheduleWindowError({ scheduledStart: '2026-09-04T11:00:00.000Z' }, BASE_JOB)).toBeNull();
    expect(scheduleWindowError({ scheduledEnd: '2026-09-04T14:00:00.000Z' }, BASE_JOB)).toBeNull();
  });

  it('has no upper bound to check against when the job has no stored end', () => {
    const job = { ...BASE_JOB, scheduledEnd: null };
    expect(scheduleWindowError({ scheduledStart: '2026-09-04T23:00:00.000Z' }, job)).toBeNull();
  });

  it('is a no-op for a cancel payload (it carries no schedule fields)', () => {
    expect(scheduleWindowError({ status: 'cancelled' }, BASE_JOB)).toBeNull();
  });
});

describe('resolveSaveError', () => {
  it('maps a 409 to the started-job message and a sheet close', () => {
    const patch = { priority: 'urgent' as const };
    expect(
      resolveSaveError(patch, apiError({ status: 409, code: 'JOB_NOT_MODIFIABLE' })),
    ).toEqual({
      message: EDIT_STARTED_MESSAGE,
      closeSheet: true,
      refreshRoster: false,
    });
  });

  it('maps a 404 on reassign to the gone-technician message and a roster refresh', () => {
    const patch = { technicianId: 'tech-9' };
    expect(
      resolveSaveError(patch, apiError({ status: 404, code: 'NOT_FOUND', message: 'Technician not found' })),
    ).toEqual({
      message: TECHNICIAN_GONE_MESSAGE,
      closeSheet: false,
      refreshRoster: true,
    });
  });

  it('does not blame the technician when a 404 arrives without one in the patch', () => {
    expect(
      resolveSaveError({ priority: 'urgent' as const }, apiError({ status: 404, code: 'NOT_FOUND', message: 'Job not found' })),
    ).toEqual({
      message: 'Job not found',
      closeSheet: false,
      refreshRoster: false,
    });
  });

  it('flattens a 422 message that arrived as an array', () => {
    expect(
      resolveSaveError(
        { priority: 'urgent' as const },
        apiError({ status: 422, code: 'VALIDATION_ERROR', message: ['a', 'b'] as unknown as string }),
      ).message,
    ).toBe('a. b');
  });

  it('passes a string 422 message through as-is', () => {
    expect(
      resolveSaveError(
        { priority: 'urgent' as const },
        apiError({ status: 422, code: 'VALIDATION_ERROR', message: 'Cancellation cannot be combined with field edits' }),
      ).message,
    ).toBe('Cancellation cannot be combined with field edits');
  });

  it('falls back to the generic message when the failure has no usable message', () => {
    // An empty message must never render as a blank error line.
    expect(
      resolveSaveError({ priority: 'urgent' as const }, apiError({ message: '' })).message,
    ).toBe(SAVE_FAILED_MESSAGE);
    // Nor an array that flattens to nothing.
    expect(
      resolveSaveError(
        { priority: 'urgent' as const },
        apiError({ message: [] as unknown as string }),
      ).message,
    ).toBe(SAVE_FAILED_MESSAGE);
  });
});
