/**
 * Stepper derivation for the technician job detail — turns the job's
 * workflow template and current state into one rendered row per step.
 * Pure, no React.
 *
 * Story 5.2: template-driven, replacing the hardcoded `STEP_ORDER` chain.
 * A stamped template has no optional steps — the effective chain is simply
 * the template's steps in order.
 */
import type { JobDetail, WorkflowTemplateStep } from '../../services';

export type StepState = 'done' | 'next' | 'locked';

export interface StepView {
  step: string; // The template step's key
  state: StepState;
  label: string; // From the template step
  advancesOn: string | null; // From the template step
  /** When the step was logged, from the matching `step_*` activity entry. */
  timestamp: string | null;
}

export type StepperJob = Pick<
  JobDetail,
  'workflowTemplate' | 'currentStepIndex' | 'status'
>;

/** The `step_<name>` activity entry's timestamp for a step, if logged. */
function loggedAt(log: Array<{ eventType: string; createdAt: string }>, stepKey: string): string | null {
  return log.find(entry => entry.eventType === `step_${stepKey}`)?.createdAt ?? null;
}

/**
 * Builds the stepper rows for a job — one row per step in the template's order.
 *
 * - At or before `currentStepIndex`: `done`
 * - The single actionable position of a non-terminal job is `next` — the first
 *   step after `currentStepIndex`, or the first step when `currentStepIndex` is null.
 * - Everything else is `locked`. Terminal jobs (completed/cancelled) never have a `next`.
 *
 * A missing template or null currentStepIndex renders safely: nothing done, steps[0] is 'next'.
 */
export function buildStepper(job: StepperJob, log: Array<{ eventType: string; createdAt: string }>): StepView[] {
  const steps = job.workflowTemplate?.steps ?? [];
  const curIdx = job.currentStepIndex ?? -1;
  const terminal = job.status === 'completed' || job.status === 'cancelled';

  return steps.map((step: WorkflowTemplateStep, index: number) => {
    let state: StepState;
    if (index <= curIdx) {
      state = 'done';
    } else if (!terminal && index === curIdx + 1) {
      state = 'next';
    } else {
      state = 'locked';
    }

    return {
      step: step.key,
      state,
      label: step.label,
      advancesOn: step.advancesOn,
      timestamp: index <= curIdx ? loggedAt(log, step.key) : null,
    };
  });
}
