/**
 * Activity-event display labels (`src/features/jobDetail/eventLabels.ts`) —
 * non-step event types must render their friendly label (never the snake_case
 * raw value), and anything unknown must pass through raw rather than crash or
 * render `undefined` (AC 3). Step events are resolved at the timeline level
 * with template-aware lookup (see ActivityTimeline).
 */
import { eventLabel } from '../src/features/jobDetail/eventLabels';

/** The non-step event types the backend emits (api-contracts §4). */
const KNOWN_EVENT_TYPES = [
  'job_created',
  'job_reassigned',
  'job_cancelled',
  'conflict_resolved',
] as const;

const EXPECTED_LABELS: Record<(typeof KNOWN_EVENT_TYPES)[number], string> = {
  job_created: 'Job created',
  job_reassigned: 'Reassigned to another technician',
  job_cancelled: 'Job cancelled',
  conflict_resolved: 'Synced an offline update',
};

describe('eventLabel', () => {
  it('has a friendly label for each of the four known non-step event types', () => {
    expect(KNOWN_EVENT_TYPES).toHaveLength(4);
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

  it('passes step event types through raw (ActivityTimeline handles template lookup)', () => {
    // Step events are resolved at the timeline level with template-aware lookup.
    expect(eventLabel('step_on_my_way')).toBe('step_on_my_way');
    expect(eventLabel('step_completed')).toBe('step_completed');
  });
});