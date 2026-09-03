/**
 * Activity-event display labels (`src/features/jobDetail/eventLabels.ts`) —
 * every event type api-contracts §4 lists must render its friendly label
 * (never the snake_case raw value), and anything unknown must pass through
 * raw rather than crash or render `undefined` (AC 3).
 */
import { eventLabel, stepNumber, STEP_LABELS } from '../src/features/jobDetail/eventLabels';

/** The ten event types the backend emits today (api-contracts §4). */
const KNOWN_EVENT_TYPES = [
  'job_created',
  'job_reassigned',
  'job_cancelled',
  'step_on_my_way',
  'step_arrived',
  'step_in_progress',
  'step_photos_uploaded',
  'step_signature_captured',
  'step_completed',
  'conflict_resolved',
] as const;

const EXPECTED_LABELS: Record<(typeof KNOWN_EVENT_TYPES)[number], string> = {
  job_created: 'Job created',
  job_reassigned: 'Reassigned to another technician',
  job_cancelled: 'Job cancelled',
  step_on_my_way: 'On my way',
  step_arrived: 'Arrived at site',
  step_in_progress: 'Work started',
  step_photos_uploaded: 'Photos uploaded',
  step_signature_captured: 'Customer signature captured',
  step_completed: 'Job completed',
  conflict_resolved: 'Synced an offline update',
};

describe('eventLabel', () => {
  it('has a friendly label for each of the ten known event types', () => {
    expect(KNOWN_EVENT_TYPES).toHaveLength(10);
    KNOWN_EVENT_TYPES.forEach(eventType => {
      expect(eventLabel(eventType)).toBe(EXPECTED_LABELS[eventType]);
    });
  });

  it('never returns the raw snake_case value for a known type', () => {
    KNOWN_EVENT_TYPES.forEach(eventType => {
      expect(eventLabel(eventType)).not.toContain('_');
    });
  });

  it.each(['something_new', 'step_forthcoming', '', 'JOB_CREATED'])(
    'passes an unknown event type (%s) through raw',
    unknown => {
      expect(eventLabel(unknown)).toBe(unknown);
    },
  );
});

describe('STEP_LABELS', () => {
  it('labels all six workflow steps', () => {
    expect(STEP_LABELS.on_my_way).toBe('On my way');
    expect(STEP_LABELS.arrived).toBe('Arrived');
    expect(STEP_LABELS.in_progress).toBe('In progress');
    expect(STEP_LABELS.photos_uploaded).toBe('Photos uploaded');
    expect(STEP_LABELS.signature_captured).toBe('Signature captured');
    expect(STEP_LABELS.completed).toBe('Completed');
  });

  it('has no entry for an unknown step — the fallback is the caller passthrough', () => {
    // The map must not gain unknown keys (a made-up label would win over the
    // raw value); the screen's `STEP_LABELS[step] ?? step` does the fallback.
    expect(Object.prototype.hasOwnProperty.call(STEP_LABELS, 'mystery_step')).toBe(false);
    expect(STEP_LABELS.mystery_step).toBeUndefined();
    // The same passthrough rule `eventLabel` applies to unknown event types.
    expect(eventLabel('mystery_step')).toBe('mystery_step');
  });
});

describe('stepNumber', () => {
  it('numbers the steps 1–6 in the fixed workflow order', () => {
    expect(stepNumber('on_my_way')).toBe(1);
    expect(stepNumber('arrived')).toBe(2);
    expect(stepNumber('in_progress')).toBe(3);
    expect(stepNumber('photos_uploaded')).toBe(4);
    expect(stepNumber('signature_captured')).toBe(5);
    expect(stepNumber('completed')).toBe(6);
  });

  it('returns 0 for an unknown step (never crashes the progress line)', () => {
    expect(stepNumber('mystery_step')).toBe(0);
  });
});