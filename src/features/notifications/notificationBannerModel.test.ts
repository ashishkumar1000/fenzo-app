/**
 * notificationBannerModel — pure logic, no mocks needed.
 */
import {
  BANNER_FALLBACK_TEXT,
  bannerPartsFromEvent,
  bannerTextFromParts,
  eventRowPayload,
  notificationStepLabel,
  notificationStepStatus,
} from './notificationBannerModel';

describe('eventRowPayload', () => {
  it('unwraps both levels of the broadcast_changes envelope (verified live against realtime.messages)', () => {
    const fields = { job_number: 'JOB-1', step: 'on_my_way', technician_name: 'Priya' };
    const row = { id: 'n1', event_type: 'on_my_way', payload: fields };
    const envelope = {
      id: 'evt-1',
      table: 'notifications',
      schema: 'public',
      operation: 'INSERT',
      old_record: null,
      record: row,
    };

    expect(eventRowPayload(envelope)).toBe(fields);
  });

  it('unwraps all THREE levels of the device-verified client shape (Task 0 spike, 2026-09-09)', () => {
    const fields = { job_number: 'JB-2026-0003', step: 'completed', technician_name: 'Ashish' };
    const row = {
      id: 'n3',
      job_id: 'j1',
      payload: fields,
      read_at: null,
      user_id: 'u1',
      tenant_id: 't1',
      created_at: '2026-09-09T05:59:55+00:00',
      event_type: 'completed',
    };
    const envelope = {
      id: 'evt-3',
      table: 'notifications',
      schema: 'public',
      operation: 'INSERT',
      old_record: null,
      record: row,
    };
    // The shape the Metro log actually showed from `on('broadcast')`.
    const channelMessage = {
      type: 'broadcast',
      event: 'INSERT',
      payload: envelope,
      meta: { id: 'evt-3' },
    };

    expect(eventRowPayload(channelMessage)).toBe(fields);
  });

  it('passes a record without a payload JSONB through unchanged', () => {
    const record = { id: 'n2' };
    expect(eventRowPayload({ record })).toEqual(record);
  });

  it('passes a bare row through unchanged (envelope-less shape tolerance)', () => {
    const row = { job_number: 'JOB-2' };
    expect(eventRowPayload(row)).toEqual(row);
  });

  it('returns null for null/undefined messages', () => {
    expect(eventRowPayload(null)).toBeNull();
    expect(eventRowPayload(undefined)).toBeNull();
  });
});

describe('notificationStepLabel', () => {
  it('humanizes every known step value', () => {
    expect(notificationStepLabel('completed')).toBe('Completed');
    expect(notificationStepLabel('signature_captured')).toBe('Signature captured');
  });

  it('renders an unknown step value raw — never undefined, never a crash', () => {
    expect(notificationStepLabel('brand_new_step')).toBe('brand_new_step');
  });

  it('does not resolve inherited prototype keys as step labels', () => {
    // `STEPS[step]` alone would pick Object.prototype members up and
    // interpolate a function's source into the banner.
    expect(notificationStepLabel('toString')).toBe('toString');
    expect(notificationStepLabel('constructor')).toBe('constructor');
  });

  it('returns the fallback copy for missing/empty/whitespace steps', () => {
    expect(notificationStepLabel(null)).toBe(BANNER_FALLBACK_TEXT);
    expect(notificationStepLabel('')).toBe(BANNER_FALLBACK_TEXT);
    expect(notificationStepLabel('   ')).toBe(BANNER_FALLBACK_TEXT);
  });
});

describe('bannerPartsFromEvent', () => {
  it('extracts every field from a full payload', () => {
    expect(
      bannerPartsFromEvent({ job_number: 'JOB-1042', step: 'arrived', technician_name: 'Priya' }),
    ).toEqual({
      technicianName: 'Priya',
      jobNumber: 'JOB-1042',
      step: 'arrived',
      stepLabel: 'Arrived',
    });
  });

  it('drops missing, empty, and non-string fields independently', () => {
    expect(bannerPartsFromEvent({ step: 'on_my_way', technician_name: 'Priya' })).toEqual({
      technicianName: 'Priya',
      jobNumber: null,
      step: 'on_my_way',
      stepLabel: 'On my way',
    });
    expect(bannerPartsFromEvent({ job_number: 'J', step: 7 })).toEqual({
      technicianName: null,
      jobNumber: 'J',
      step: null,
      stepLabel: null,
    });
    expect(bannerPartsFromEvent({})).toEqual({
      technicianName: null,
      jobNumber: null,
      step: null,
      stepLabel: null,
    });
  });

  it('drops whitespace-only fields — a blank chip is worse than no chip', () => {
    expect(
      bannerPartsFromEvent({ job_number: '   ', step: '  ', technician_name: '\t\n' }),
    ).toEqual({
      technicianName: null,
      jobNumber: null,
      step: null,
      stepLabel: null,
    });
  });

  it('returns all-null parts on a null/undefined payload', () => {
    expect(bannerPartsFromEvent(null)).toEqual({
      technicianName: null,
      jobNumber: null,
      step: null,
      stepLabel: null,
    });
  });
});

describe('bannerTextFromParts', () => {
  it('joins the non-null parts with the dot separator', () => {
    expect(
      bannerTextFromParts({
        technicianName: 'Priya',
        jobNumber: 'JOB-1042',
        step: 'arrived',
        stepLabel: 'Arrived',
      }),
    ).toBe('Priya · JOB-1042 · Arrived');
  });

  it('keeps the good fields of a partial payload (missing/empty/non-string fields dropped)', () => {
    // Redesigned toast (2026-09-09): the line composes whatever the payload
    // carried — only an all-fields-missing payload collapses to the fallback.
    expect(
      bannerTextFromParts({
        technicianName: 'Priya',
        jobNumber: null,
        step: 'on_my_way',
        stepLabel: 'On my way',
      }),
    ).toBe('Priya · On my way');
    expect(
      bannerTextFromParts({
        technicianName: null,
        jobNumber: 'J',
        step: null,
        stepLabel: null,
      }),
    ).toBe('J');
  });

  it('drops empty-string parts — an exported API never emits stray separators', () => {
    expect(
      bannerTextFromParts({
        technicianName: '',
        jobNumber: 'J',
        step: null,
        stepLabel: null,
      }),
    ).toBe('J');
  });

  it('falls back to generic copy when every part is null', () => {
    expect(
      bannerTextFromParts({
        technicianName: null,
        jobNumber: null,
        step: null,
        stepLabel: null,
      }),
    ).toBe(BANNER_FALLBACK_TEXT);
  });
});

describe('notificationStepStatus', () => {
  it('maps terminal-ish steps to done and the rest to progress', () => {
    expect(notificationStepStatus('arrived')).toBe('done');
    expect(notificationStepStatus('completed')).toBe('done');
    expect(notificationStepStatus('on_my_way')).toBe('progress');
    expect(notificationStepStatus('in_progress')).toBe('progress');
    expect(notificationStepStatus('photos_uploaded')).toBe('progress');
    expect(notificationStepStatus('signature_captured')).toBe('progress');
  });

  it('maps unknown and missing steps to neutral — never a crash', () => {
    expect(notificationStepStatus('brand_new_step')).toBe('neutral');
    expect(notificationStepStatus('toString')).toBe('neutral');
    expect(notificationStepStatus(null)).toBe('neutral');
  });
});
