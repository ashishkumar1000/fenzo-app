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

export type StepperJob = Pick<
  JobDetail,
  'currentStep' | 'requireCompletionPhoto' | 'requireCompletionSignature' | 'status'
>;

/** The `step_<name>` activity entry's timestamp for a step, if logged. */
function loggedAt(log: ActivityLogEntry[], step: WorkflowStep): string | null {
  return log.find(entry => entry.eventType === `step_${step}`)?.createdAt ?? null;
}

/**
 * The one step the effective chain routes to next, from `curIdx`: optional
 * steps whose flag is off are walked over (`photos_uploaded` without the
 * photo flag, `signature_captured` without the signature flag) until the
 * first surviving step — the only legal advance target (BE
 * `workflow.service.ts` effective-chain rule). True exactly when `stepIdx`
 * is that step.
 */
function isEffectiveNext(job: StepperJob, stepIdx: number, curIdx: number): boolean {
  let idx = curIdx + 1;
  while (idx < STEP_ORDER.length) {
    const skippedByFlag =
      (STEP_ORDER[idx] === 'photos_uploaded' && !job.requireCompletionPhoto) ||
      (STEP_ORDER[idx] === 'signature_captured' && !job.requireCompletionSignature);
    if (!skippedByFlag) return idx === stepIdx;
    idx += 1;
  }
  return false;
}

/**
 * Builds the stepper rows for a job — one row per step the job's effective
 * chain actually has (api-contracts §1: `signature_captured` skippable only
 * when `requireCompletionSignature === false`).
 *
 * - At or before `currentStep`: `done` — except `photos_uploaded`, which
 *   renders `skipped` when photos aren't required and no `step_photos_uploaded`
 *   entry was ever logged (the server allows advancing straight over it).
 * - The single actionable position of a non-terminal job is `next` — the
 *   first step the effective chain routes to (see `isEffectiveNext`): with
 *   both flags off, `completed` is reachable straight from `in_progress`.
 * - Everything else is `locked`. Terminal jobs (completed/cancelled) never
 *   have a `next`.
 *
 * Two deliberate asymmetries with photos:
 *   - `photos_uploaded` KEEPS its row even when not required (renders
 *     `skipped`) — photo upload stays available on every job (3.4 ships it
 *     unconditionally). The signature row is DROPPED when not required —
 *     capture does not exist at all (requirement decision 2026-09-05: no
 *     voluntary capture).
 *   - Exception to the drop: `currentStep === 'signature_captured'` with the
 *     flag since switched off (an owner edit mid-job) — the step happened,
 *     so its historical row renders `done` rather than vanishing.
 */
export function buildStepper(job: StepperJob, log: ActivityLogEntry[]): StepView[] {
  const curIdx = job.currentStep === null ? -1 : STEP_ORDER.indexOf(job.currentStep);
  const terminal = job.status === 'completed' || job.status === 'cancelled';
  const showSignatureRow = job.requireCompletionSignature || job.currentStep === 'signature_captured';

  return STEP_ORDER.filter(step => step !== 'signature_captured' || showSignatureRow).map(step => {
    const stepIdx = STEP_ORDER.indexOf(step);
    if (stepIdx <= curIdx) {
      const at = loggedAt(log, step);
      const skipped = step === 'photos_uploaded' && !job.requireCompletionPhoto && !at;
      return { step, state: skipped ? 'skipped' : 'done', timestamp: at };
    }
    if (!job.requireCompletionPhoto && step === 'photos_uploaded' && curIdx === STEP_ORDER.indexOf('in_progress')) {
      return { step, state: 'skipped', timestamp: null };
    }
    const state = !terminal && isEffectiveNext(job, stepIdx, curIdx) ? 'next' : 'locked';
    return { step, state, timestamp: null };
  });
}
