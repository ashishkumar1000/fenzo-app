/**
 * Stepper derivation for the technician job detail — turns the job's
 * workflow state into one rendered row per step. Pure, no React.
 *
 * This is the seam Story 3.3's action bar and Story 4.2's optimistic
 * application both build on, so the rules here deliberately mirror the
 * backend's `workflow.service.ts` step-ordering (including the photo-skip
 * exception) — if the two disagree, the UI will offer a step the server
 * rejects.
 */
import type { ActivityLogEntry, JobDetail } from '../../services';

/**
 * The fixed step order (api-contracts §1) — duplicated from
 * `features/jobDetail/eventLabels` so the technician feature owns its own
 * vocabulary; the two must stay identical.
 */
export const STEP_ORDER = [
  'on_my_way',
  'arrived',
  'in_progress',
  'photos_uploaded',
  'signature_captured',
  'completed',
] as const;

export type WorkflowStep = (typeof STEP_ORDER)[number];

export type StepState = 'done' | 'next' | 'locked' | 'skipped';

export interface StepView {
  step: WorkflowStep;
  state: StepState;
  /** When the step was logged, from the matching `step_*` activity entry. */
  timestamp: string | null;
}

export type StepperJob = Pick<JobDetail, 'currentStep' | 'requireCompletionPhoto' | 'status'>;

/** The `step_<name>` activity entry's timestamp for a step, if logged. */
function loggedAt(log: ActivityLogEntry[], step: WorkflowStep): string | null {
  return log.find(entry => entry.eventType === `step_${step}`)?.createdAt ?? null;
}

/**
 * Builds the six stepper rows for a job.
 *
 * - At or before `currentStep`: `done` — except `photos_uploaded`, which
 *   renders `skipped` when photos aren't required and no `step_photos_uploaded`
 *   entry was ever logged (the server allows advancing straight over it).
 * - The single actionable position of a non-terminal job is `next` — normally
 *   `currentStep + 1`, but when photos aren't required and work is under way,
 *   signature is the actionable step while photos shows `skipped`.
 * - Everything else is `locked`. Terminal jobs (completed/cancelled) never
 *   have a `next`.
 */
export function buildStepper(job: StepperJob, log: ActivityLogEntry[]): StepView[] {
  const curIdx = job.currentStep === null ? -1 : STEP_ORDER.indexOf(job.currentStep);
  const terminal = job.status === 'completed' || job.status === 'cancelled';

  return STEP_ORDER.map((step, i) => {
    if (i <= curIdx) {
      const at = loggedAt(log, step);
      const skipped = step === 'photos_uploaded' && !job.requireCompletionPhoto && !at;
      return { step, state: skipped ? 'skipped' : 'done', timestamp: at };
    }
    const isNext =
      !terminal &&
      (i === curIdx + 1 ||
        // Photo skip: with no photo required, signature (two ahead of
        // in_progress) is the real actionable step — the server takes it
        // directly (workflow.service validateStep).
        (i === curIdx + 2 &&
          STEP_ORDER[curIdx + 1] === 'photos_uploaded' &&
          !job.requireCompletionPhoto));
    if (!job.requireCompletionPhoto && step === 'photos_uploaded' && curIdx === STEP_ORDER.indexOf('in_progress')) {
      return { step, state: 'skipped', timestamp: null };
    }
    return { step, state: isNext ? 'next' : 'locked', timestamp: null };
  });
}
