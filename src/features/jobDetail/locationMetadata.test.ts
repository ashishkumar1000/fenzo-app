/**
 * Tests for the defensive parser of `activityLog[].metadata` (story 7.10):
 * the RPC merges location fields with `jsonb_strip_nulls`, so keys vanish
 * rather than arriving null — the parser must reproduce the RPC's write
 * branches exactly and never trust the wire shape.
 */
import {
  jobSiteCoords,
  lastKnownTechnicianLocation,
  parseStepLocation,
} from './locationMetadata';

describe('lastKnownTechnicianLocation', () => {
  const entry = (id: string, metadata: unknown) =>
    ({ id, eventType: 'step_completed', metadata }) as Parameters<
      typeof lastKnownTechnicianLocation
    >[0][number];

  it('returns the most recent captured fix (oldest-first log)', () => {
    const entries = [
      entry('log-1', { latitude: 12.9716, longitude: 77.5946 }),
      entry('log-2', { latitude: 12.9816, longitude: 77.6046 }),
      entry('log-3', { locationCaptured: false, reason: 'denied' }),
    ];
    expect(lastKnownTechnicianLocation(entries)).toEqual({
      latitude: 12.9816,
      longitude: 77.6046,
    });
  });

  it('returns null when no row has a captured fix', () => {
    const entries = [
      entry('log-1', null),
      entry('log-2', { locationCaptured: false, reason: 'denied' }),
      entry('log-3', { latitude: 12.9716, longitude: null }),
    ];
    expect(lastKnownTechnicianLocation(entries)).toBeNull();
  });
});

describe('jobSiteCoords', () => {
  it('passes both halves through when the customer has them', () => {
    expect(jobSiteCoords({ latitude: 12.9716, longitude: 77.5946 })).toEqual({
      latitude: 12.9716,
      longitude: 77.5946,
    });
  });

  it('returns null when either half is missing — never half-used', () => {
    expect(jobSiteCoords({ latitude: null, longitude: 77.5946 })).toBeNull();
    expect(jobSiteCoords({ latitude: 12.9716, longitude: null })).toBeNull();
    expect(jobSiteCoords({ latitude: null, longitude: null })).toBeNull();
  });
});

describe('parseStepLocation', () => {
  it('returns none for null metadata (pre-Epic-7 rows)', () => {
    expect(parseStepLocation(null)).toEqual({ kind: 'none' });
  });

  it('returns none for metadata without any location keys', () => {
    expect(parseStepLocation({ technicianId: 'u-1' })).toEqual({ kind: 'none' });
  });

  it('parses a captured fix with accuracy and flag', () => {
    expect(
      parseStepLocation({
        latitude: 12.9716,
        longitude: 77.5946,
        accuracy: 18.4,
        locationCaptured: true,
        accuracyFlagged: true,
      }),
    ).toEqual({
      kind: 'captured',
      latitude: 12.9716,
      longitude: 77.5946,
      accuracy: 18.4,
      flagged: true,
    });
  });

  it('treats locationCaptured as implied when coordinates are present', () => {
    // jsonb_strip_nulls drops locationCaptured when the service stored null
    // for it — coordinate presence is the source of truth, not the boolean.
    expect(parseStepLocation({ latitude: -33.86, longitude: 151.21 })).toEqual({
      kind: 'captured',
      latitude: -33.86,
      longitude: 151.21,
      accuracy: null,
      flagged: false,
    });
  });

  it('treats a partial pair as no coordinates (RPC: together or not at all)', () => {
    expect(parseStepLocation({ latitude: 12.9716 })).toEqual({ kind: 'none' });
    expect(parseStepLocation({ longitude: 77.5946 })).toEqual({ kind: 'none' });
  });

  it('rejects out-of-range or non-numeric coordinates as none', () => {
    expect(parseStepLocation({ latitude: 91, longitude: 77 })).toEqual({ kind: 'none' });
    expect(parseStepLocation({ latitude: '12.9', longitude: 77 })).toEqual({ kind: 'none' });
    expect(parseStepLocation({ latitude: Number.NaN, longitude: 77 })).toEqual({ kind: 'none' });
  });

  it('parses a missed capture with its server-authored reason', () => {
    expect(
      parseStepLocation({ locationCaptured: false, reason: 'Location not provided' }),
    ).toEqual({ kind: 'missed', reason: 'Location not provided' });
  });

  it('parses a missed capture without a reason', () => {
    expect(parseStepLocation({ locationCaptured: false })).toEqual({
      kind: 'missed',
      reason: null,
    });
  });

  it('is defensive against hostile metadata shapes', () => {
    // Arrays, primitives, and garbage values must all degrade to none.
    expect(parseStepLocation([] as unknown as Record<string, unknown>)).toEqual({ kind: 'none' });
    expect(parseStepLocation('nope' as unknown as Record<string, unknown>)).toEqual({
      kind: 'none',
    });
    // Non-string reason is dropped, never surfaced.
    expect(
      parseStepLocation({ locationCaptured: false, reason: 42 as unknown as string }),
    ).toEqual({ kind: 'missed', reason: null });
  });
});
