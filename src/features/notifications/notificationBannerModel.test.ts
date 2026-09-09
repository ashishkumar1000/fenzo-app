/**
 * notificationBannerModel — pure logic, no mocks needed.
 */
import {
  BANNER_FALLBACK_TEXT,
  bannerTextFromEvent,
  eventRowPayload,
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

describe('bannerTextFromEvent', () => {
  it('formats "{technician_name} · {job_number} · {step label}" from a full payload', () => {
    expect(
      bannerTextFromEvent({
        job_number: 'JOB-1042',
        step: 'on_my_way',
        technician_name: 'Priya',
      }),
    ).toBe('Priya · JOB-1042 · On my way');
  });

  it('humanizes every known step value', () => {
    expect(bannerTextFromEvent({ job_number: 'J', step: 'completed', technician_name: 'R' }))
      .toBe('R · J · Completed');
    expect(bannerTextFromEvent({ job_number: 'J', step: 'signature_captured', technician_name: 'R' }))
      .toBe('R · J · Signature captured');
  });

  it('renders an unknown step value raw — never undefined, never a crash', () => {
    expect(bannerTextFromEvent({ job_number: 'J', step: 'brand_new_step', technician_name: 'R' }))
      .toBe('R · J · brand_new_step');
  });

  it('does not resolve inherited prototype keys as step labels', () => {
    // `STEP_LABELS[step] ?? step` alone would pick Object.prototype members
    // up and interpolate a function's source into the banner.
    expect(bannerTextFromEvent({ job_number: 'J', step: 'toString', technician_name: 'R' }))
      .toBe('R · J · toString');
    expect(bannerTextFromEvent({ job_number: 'J', step: 'constructor', technician_name: 'R' }))
      .toBe('R · J · constructor');
  });

  it('falls back to generic copy when a field is missing, empty, or non-string', () => {
    expect(bannerTextFromEvent({ step: 'on_my_way', technician_name: 'Priya' }))
      .toBe(BANNER_FALLBACK_TEXT);
    expect(bannerTextFromEvent({ job_number: '', step: 'on_my_way', technician_name: 'Priya' }))
      .toBe(BANNER_FALLBACK_TEXT);
    expect(bannerTextFromEvent({ job_number: 'J', step: 7, technician_name: 'Priya' }))
      .toBe(BANNER_FALLBACK_TEXT);
    expect(bannerTextFromEvent({})).toBe(BANNER_FALLBACK_TEXT);
  });

  it('falls back on a null/undefined payload (shape drift never blocks the banner)', () => {
    expect(bannerTextFromEvent(null)).toBe(BANNER_FALLBACK_TEXT);
    expect(bannerTextFromEvent(undefined)).toBe(BANNER_FALLBACK_TEXT);
  });
});
