/**
 * Activity-event display labels for the job detail timeline — API vocabulary
 * in, UI vocabulary out. Pure functions, no React.
 *
 * The event types are the values api-contracts §4 lists as known on the wire.
 * Anything else (a new server-side event the app hasn't shipped with) renders
 * as its raw value — never crash, never render `undefined`.
 */

import type { StatusKey } from '../../theme';
import type { WorkflowTemplate } from '../../services';

const LABELS: Record<string, string> = {
  job_created: 'Job created',
  job_reassigned: 'Reassigned to another technician',
  job_cancelled: 'Job cancelled',
  conflict_resolved: 'Synced an offline update',
};

export const eventLabel = (t: string) => LABELS[t] ?? t;

/**
 * Status class per event type — the timeline's dot colour coding, shared by
 * the timeline rows and the header's latest-event badge: completed steps
 * green, in-progress steps blue, cancellation red, everything else neutral
 * grey (created, reassigned, conflict-resolved, unknown future types).
 */
export function eventStatusKey(eventType: string): StatusKey {
  // Guard against null/undefined eventType (API contract violation, but
  // safe) — same rule `resolveEventLabel` applies.
  if (!eventType) return 'neutral';
  if (eventType === 'step_completed') return 'done';
  if (eventType === 'job_cancelled') return 'cancelled';
  if (eventType.startsWith('step_')) return 'progress';
  return 'neutral';
}

/**
 * Resolve an event's label, with template-aware lookup for step events.
 * `step_*` events extract their step key and read the label from the job's
 * workflow template; everything else goes through `eventLabel`. Anything
 * unresolvable renders its raw value — never crash, never `undefined`.
 * Shared by the ActivityTimeline rows and the header's latest-event badge.
 */
export function resolveEventLabel(
  eventType: string,
  workflowTemplate?: WorkflowTemplate | null,
): string {
  // Guard against null/undefined eventType (API contract violation, but safe).
  if (!eventType) return eventType;

  // Non-step events get the standard lookup.
  if (!eventType.startsWith('step_')) {
    return eventLabel(eventType);
  }

  // Step events: extract the key (e.g., 'step_on_my_way' → 'on_my_way').
  const stepKey = eventType.replace(/^step_/, '');

  // Look up the step in the template if available.
  if (workflowTemplate?.steps) {
    const step = workflowTemplate.steps.find(s => s.key === stepKey);
    if (step?.label) {
      return step.label;
    }
  }

  // Fallback: return the raw event type (never crash).
  return eventType;
}
