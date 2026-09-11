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
  conflict_resolved: 'Synced an offline update',
};

export const eventLabel = (t: string) => LABELS[t] ?? t;