/**
 * Tests for officeFormModel — the pure form layer behind
 * OfficeFormScreen (Story 15-4): validation mirrors the 15-3 server 422
 * ranges, formFromDetail picks the LATEST rule in the ascending history,
 * the diff gates keep an unchanged save from sending anything, and the
 * builders shape the create payload / edit PATCH (rules as a COMPLETE
 * five-field set, never partial).
 */
import {
  buildCreateRequest,
  buildUpdatePatch,
  emptyOfficeForm,
  formFromDetail,
  hasErrors,
  isValidTime,
  profileChanged,
  rulesChanged,
  validateOfficeForm,
  type OfficeFormState,
} from './officeFormModel';
import type { OfficeDetail, OfficeRule } from '../../../types/office';

function detail(overrides: Partial<OfficeDetail> = {}): OfficeDetail {
  return {
    id: 'office-1',
    name: 'Andheri branch',
    latitude: 19.1364,
    longitude: 72.8296,
    radiusM: 100,
    archivedAt: null,
    rules: [rule('rule-1')],
    ...overrides,
  };
}

function rule(id: string, overrides: Partial<OfficeRule> = {}): OfficeRule {
  return {
    id,
    startTime: '09:00',
    endTime: '18:00',
    lateCutoffMinutes: 15,
    fullDayHours: 8,
    halfDayHours: 4,
    validFrom: '2026-09-01',
    validTo: null,
    ...overrides,
  };
}

function form(overrides: Partial<OfficeFormState> = {}): OfficeFormState {
  return {
    ...emptyOfficeForm(),
    name: 'Andheri branch',
    latitude: 19.1364,
    longitude: 72.8296,
    startTime: '09:00',
    endTime: '18:00',
    ...overrides,
  };
}

describe('isValidTime', () => {
  it.each([
    ['00:00', true],
    ['09:05', true],
    ['23:59', true],
    ['24:00', false],
    ['9:00', false],
    ['09:60', false],
    ['0900', false],
    ['', false],
  ])('%s → %p', (input, expected) => {
    expect(isValidTime(input)).toBe(expected);
  });
});

describe('validateOfficeForm', () => {
  it('returns an all-undefined errors object for the happy path', () => {
    expect(validateOfficeForm(form())).toEqual({});
    expect(hasErrors(validateOfficeForm(form()))).toBe(false);
  });

  it('requires a name within 80 characters', () => {
    expect(validateOfficeForm(form({ name: '   ' })).name).toBe('Enter an office name');
    expect(validateOfficeForm(form({ name: 'x'.repeat(81) })).name).toContain('80 characters');
    // Exactly 80 is within the limit.
    expect(validateOfficeForm(form({ name: 'x'.repeat(80) })).name).toBeUndefined();
    expect(validateOfficeForm(form({ name: '  Padded  ' })).name).toBeUndefined();
  });

  it('requires a placed pin', () => {
    expect(validateOfficeForm(form({ latitude: null })).location).toBe(
      'Place the office pin on the map',
    );
    expect(validateOfficeForm(form({ longitude: null })).location).toBeDefined();
  });

  it('validates the radius against the 50–1000 DB range', () => {
    expect(validateOfficeForm(form({ radiusM: 49 })).radiusM).toBe(
      'Radius must be 50–1000 metres',
    );
    expect(validateOfficeForm(form({ radiusM: 1001 })).radiusM).toBeDefined();
    expect(validateOfficeForm(form({ radiusM: 50 })).radiusM).toBeUndefined();
    expect(validateOfficeForm(form({ radiusM: 1000 })).radiusM).toBeUndefined();
  });

  it('validates the time range and end-after-start', () => {
    expect(validateOfficeForm(form({ startTime: '9:00' })).startTime).toBeDefined();
    expect(validateOfficeForm(form({ endTime: '18:60' })).endTime).toBeDefined();
    expect(validateOfficeForm(form({ endTime: '09:00' })).endTime).toBe(
      'End time must be after the start time',
    );
    // The end check only runs when the start itself is valid.
    expect(validateOfficeForm(form({ startTime: 'bad', endTime: '09:00' })).endTime).toBeUndefined();
  });

  it.each([
    ['', 'Enter the late cut-off'],
    ['   ', 'Enter the late cut-off'],
    ['-1', 'Late cut-off'],
    ['121', 'Late cut-off'],
    ['1.5', 'Late cut-off'],
    ['abc', 'Late cut-off'],
    ['0', undefined],
    ['120', undefined],
  ])('late cut-off %s → %p', (value, expectedPrefix) => {
    const error = validateOfficeForm(form({ lateCutoffMinutes: value })).lateCutoffMinutes;
    if (expectedPrefix === undefined) {
      expect(error).toBeUndefined();
    } else {
      expect(error).toContain(expectedPrefix);
    }
  });

  it('requires full-day hours > 0', () => {
    expect(validateOfficeForm(form({ fullDayHours: '0' })).fullDayHours).toBeDefined();
    expect(validateOfficeForm(form({ fullDayHours: '-2' })).fullDayHours).toBeDefined();
    expect(validateOfficeForm(form({ fullDayHours: '' })).fullDayHours).toBeDefined();
    // Non-numeric strings must not slip through as 0.
    expect(validateOfficeForm(form({ fullDayHours: 'abc' })).fullDayHours).toBeDefined();
  });

  it('requires half-day hours > 0 and < full-day', () => {
    expect(validateOfficeForm(form({ halfDayHours: '0' })).halfDayHours).toBeDefined();
    expect(validateOfficeForm(form({ halfDayHours: '8' })).halfDayHours).toBe(
      'Half-day hours must be less than full-day hours',
    );
    expect(validateOfficeForm(form({ halfDayHours: '9' })).halfDayHours).toBeDefined();
    expect(validateOfficeForm(form({ halfDayHours: '4' })).halfDayHours).toBeUndefined();
    expect(validateOfficeForm(form({ halfDayHours: 'abc' })).halfDayHours).toBeDefined();
  });

  it('hasErrors is true when any field failed', () => {
    expect(hasErrors(validateOfficeForm(form({ name: '' })))).toBe(true);
    expect(hasErrors(validateOfficeForm(form({ endTime: '09:00' })))).toBe(true);
  });
});

describe('formFromDetail', () => {
  it('pre-fills from the LATEST rule in the ascending history', () => {
    const loaded = detail({
      rules: [
        rule('rule-old', { startTime: '08:00', endTime: '17:00', validTo: '2026-09-26' }),
        rule('rule-new', { startTime: '10:00', endTime: '19:00', validFrom: '2026-09-27' }),
      ],
    });
    const state = formFromDetail(loaded);

    expect(state).toMatchObject({
      name: 'Andheri branch',
      latitude: 19.1364,
      longitude: 72.8296,
      radiusM: 100,
      startTime: '10:00',
      endTime: '19:00',
    });
  });

  it('falls back to the create defaults when the office has no rule yet', () => {
    const state = formFromDetail(detail({ rules: [] }));

    expect(state.startTime).toBe('09:30');
    expect(state.endTime).toBe('18:30');
    expect(state.lateCutoffMinutes).toBe('15');
    expect(state.fullDayHours).toBe('8');
    expect(state.halfDayHours).toBe('4');
  });

  it('seeds the 18-5 default times on a NEW office form (times are mandatory — never blank)', () => {
    const fresh = emptyOfficeForm();

    expect(fresh.startTime).toBe('09:30');
    expect(fresh.endTime).toBe('18:30');
    expect(fresh.lateCutoffMinutes).toBe('15');
    expect(fresh.fullDayHours).toBe('8');
    expect(fresh.halfDayHours).toBe('4');
    // The seed is itself a valid rule — an owner tapping through Add-office
    // cannot silently ship a blank-time form.
    expect(hasErrors(validateOfficeForm({ ...fresh, name: 'X', latitude: 1, longitude: 2 }))).toBe(
      false,
    );
  });

  it('pins the LAST array entry as the latest rule (the server guarantees ascending validFrom)', () => {
    // Deliberately NOT ascending — the model trusts the server's ordering
    // and takes the tail of the history either way; this test documents it.
    const loaded = detail({
      rules: [
        rule('rule-future', { startTime: '10:00', endTime: '19:00', validFrom: '2027-01-01' }),
        rule('rule-current', { startTime: '08:00', endTime: '17:00' }),
      ],
    });

    expect(formFromDetail(loaded)).toMatchObject({
      startTime: '08:00',
      endTime: '17:00',
    });
  });
});

describe('rulesChanged / profileChanged', () => {
  it('is false for an untouched edit', () => {
    const loaded = detail();
    expect(rulesChanged(formFromDetail(loaded), loaded)).toBe(false);
    expect(profileChanged(formFromDetail(loaded), loaded)).toBe(false);
  });

  it('is true for a rules field change and for a profile field change', () => {
    const loaded = detail();
    const base = formFromDetail(loaded);
    expect(rulesChanged(form({ ...base, startTime: '10:00' }), loaded)).toBe(true);
    expect(profileChanged(form({ ...base, radiusM: 250 }), loaded)).toBe(true);
  });

  it('ignores trailing whitespace in the name when diffing the profile', () => {
    const loaded = detail();
    const base = formFromDetail(loaded);
    expect(profileChanged(form({ ...base, name: ' Andheri branch ' }), loaded)).toBe(false);
  });
});

describe('buildCreateRequest', () => {
  it('trims the name and casts the rule fields to numbers', () => {
    const payload = buildCreateRequest(form({ name: '  Andheri branch  ' }));

    expect(payload).toEqual({
      name: 'Andheri branch',
      latitude: 19.1364,
      longitude: 72.8296,
      radiusM: 100,
      startTime: '09:00',
      endTime: '18:00',
      lateCutoffMinutes: 15,
      fullDayHours: 8,
      halfDayHours: 4,
    });
  });
});

describe('buildUpdatePatch', () => {
  it('sends nothing for an unchanged save', () => {
    const loaded = detail();
    const patch = buildUpdatePatch(formFromDetail(loaded), loaded);

    expect(patch).toEqual({});
  });

  it('sends the four profile fields only when the profile changed', () => {
    const loaded = detail();
    const base = formFromDetail(loaded);
    const patch = buildUpdatePatch(form({ ...base, name: 'Renamed' }), loaded);

    expect(patch).toEqual({
      name: 'Renamed',
      latitude: 19.1364,
      longitude: 72.8296,
      radiusM: 100,
    });
  });

  it('sends the TRIMMED name when the rename only added whitespace', () => {
    const loaded = detail();
    const base = formFromDetail(loaded);
    const patch = buildUpdatePatch(form({ ...base, name: '  Renamed  ' }), loaded);

    expect(patch.name).toBe('Renamed');
  });

  it('sends the COMPLETE five-field rules set when one rule field changed', () => {
    const loaded = detail();
    const base = formFromDetail(loaded);
    const patch = buildUpdatePatch(form({ ...base, endTime: '19:00' }), loaded);

    expect(patch).toEqual({
      startTime: '09:00',
      endTime: '19:00',
      lateCutoffMinutes: 15,
      fullDayHours: 8,
      halfDayHours: 4,
    });
  });

  it('sends both groups when both changed', () => {
    const loaded = detail();
    const base = formFromDetail(loaded);
    const patch = buildUpdatePatch(form({ ...base, radiusM: 300, endTime: '19:00' }), loaded);

    expect(Object.keys(patch).sort()).toEqual([
      'endTime',
      'fullDayHours',
      'halfDayHours',
      'lateCutoffMinutes',
      'latitude',
      'longitude',
      'name',
      'radiusM',
      'startTime',
    ]);
  });
});
