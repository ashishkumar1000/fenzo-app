/**
 * Activity-event display labels for the job detail timeline — API vocabulary
 * in, UI vocabulary out. Pure functions, no React.
 *
 * The event types are the values api-contracts §4 lists as known on the wire.
 * Anything else (a new server-side event the app hasn't shipped with) renders
 * as its raw value — never crash, never render `undefined`.
 */

const LABELS: Record<string, string> = {
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

export const eventLabel = (t: string) => LABELS[t] ?? t;

/**
 * Workflow step → display label, for progress lines ("Step N of 6 — In
 * progress") and the technician stepper (§9). Same unknown-value rule as
 * `eventLabel`: fall through to the raw value instead of a crash.
 */
export const STEP_LABELS: Record<string, string> = {
  on_my_way: 'On my way',
  arrived: 'Arrived',
  in_progress: 'In progress',
  photos_uploaded: 'Photos uploaded',
  signature_captured: 'Signature captured',
  completed: 'Completed',
};

/** The fixed step order from api-contracts §1 — drives "Step N of 6". */
export const STEP_ORDER = [
  'on_my_way',
  'arrived',
  'in_progress',
  'photos_uploaded',
  'signature_captured',
  'completed',
] as const;

/** 1-based position of a step in the workflow; 0 for an unknown step. */
export const stepNumber = (step: string) => {
  const index = (STEP_ORDER as readonly string[]).indexOf(step);
  return index === -1 ? 0 : index + 1;
};