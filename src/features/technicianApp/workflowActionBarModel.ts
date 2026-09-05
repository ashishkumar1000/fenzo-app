/**
 * workflowActionBarModel — pure logic behind the technician job detail's
 * bottom action bar (spec §9) and the advance call's error handling.
 *
 * Two jobs:
 *   1. `actionBarAction` derives WHAT the bar shows for a job: the single
 *      primary button labelled by the next step, the non-tappable
 *      photo-hint pill (photos upload advances server-side on confirm,
 *      fenzit-be Story 3.6), the static "Job completed" row, or nothing.
 *      It reuses `buildStepper` so the bar and the rail can never disagree
 *      about which step is actionable.
 *   2. `classifyAdvanceError` turns a failed advance into the screen's
 *      branches. Every classification is verified against fenzit-be's
 *      `workflow.service.ts` + `GlobalExceptionFilter`:
 *        422 INVALID_WORKFLOW_STEP → body carries the server `currentStep`
 *          (reconcile silently, no error UI); without one, refetch instead;
 *        409 → terminal status OR a lost concurrent race, indistinguishable
 *          — fixed copy + full refetch;
 *        403 → the job was reassigned away — route to the unassigned view;
 *        status 0 → offline (Epic 4 replaces this with an enqueue);
 *        anything else → inline error with the backend's message.
 */
import type { ActivityLogEntry, ApiError } from '../../services';
import { FALLBACK_ERROR_MESSAGE, workflowCurrentStep } from '../../services/api/apiError';
import { buildStepper, type StepperJob, type WorkflowStep } from './stepperModel';

/**
 * Button copy per step (spec §9). `photos_uploaded` is never a button — the
 * bar shows the photo-hint pill instead (its label lives in
 * `PHOTO_HINT_MESSAGE`), so the map excludes it at the type level.
 */
export const ADVANCE_LABELS: Record<Exclude<WorkflowStep, 'photos_uploaded'>, string> = {
  on_my_way: 'On my way',
  arrived: 'Arrived',
  in_progress: 'Start work',
  signature_captured: 'Capture signature',
  completed: 'Mark complete',
};

/** The non-tappable photo pill's copy — shared with the action bar render. */
export const PHOTO_HINT_MESSAGE = 'Upload a photo to continue';

/** Fixed 409 copy (AC6) — the backend's raw message is never shown. */
export const JOB_LOCKED_MESSAGE = 'This job can no longer be updated';

export type ActionBarAction =
  /** The single primary advance button for `step`. */
  | { kind: 'button'; step: WorkflowStep; label: string }
  /** Non-tappable "Upload a photo to continue" pill. */
  | { kind: 'photoHint' }
  /** Static success row: tick + "Job completed". */
  | { kind: 'completed' }
  /** Terminal/cancelled — the bar renders nothing. */
  | { kind: 'none' };

export function actionBarAction(job: StepperJob, log: ActivityLogEntry[]): ActionBarAction {
  if (job.status === 'cancelled') return { kind: 'none' };
  if (job.status === 'completed') return { kind: 'completed' };

  const next = buildStepper(job, log).find(step => step.state === 'next');
  // A non-terminal job always has exactly one actionable step — an absent
  // `next` is a contract violation, and showing no bar is the safe fallback.
  if (!next) return { kind: 'none' };
  if (next.step === 'photos_uploaded') return { kind: 'photoHint' };
  return { kind: 'button', step: next.step, label: ADVANCE_LABELS[next.step] };
}

export type AdvanceErrorPlan =
  /** 422 step race — patch `currentStep` into local state, show NO error. */
  | { kind: 'reconcile'; currentStep: string | null }
  /**
   * 422 INVALID_WORKFLOW_STEP with NO server `currentStep` in the body — a
   * race we can't reconcile from the error alone. Local state stays put; the
   * caller refetches silently and re-derives from server truth.
   */
  | { kind: 'reconcileRefresh' }
  /** 409 — fixed copy + full detail refetch. */
  | { kind: 'locked' }
  /**
   * 403 — the job was reassigned away mid-advance; the caller routes to the
   * unassigned view (and the leaving refetch clears the stale list card).
   */
  | { kind: 'unassigned' }
  /** status 0 — inline error with retry (Epic 4 replaces this with enqueue). */
  | { kind: 'offline'; message: string }
  /** 401/404/5xx — inline error with the backend's message. */
  | { kind: 'generic'; message: string };

/**
 * Verified against fenzit-be `workflow.service.ts` + `GlobalExceptionFilter`:
 * only `INVALID_WORKFLOW_STEP` carries `currentStep` (top-level in the body);
 * a 409's code is `JOB_NOT_MODIFIABLE` but the fixed branch keys on the
 * status — the two failure modes (terminal, lost race) are indistinguishable
 * and both want the same copy + refetch.
 */
export function classifyAdvanceError(err: ApiError): AdvanceErrorPlan {
  // Shape check: anything without a numeric `status` isn't a real `ApiError`
  // (a raw Error leaked past the service boundary) — don't trust its fields.
  if (typeof (err as { status?: unknown }).status !== 'number') {
    return { kind: 'generic', message: FALLBACK_ERROR_MESSAGE };
  }
  if (err.status === 422 && err.code === 'INVALID_WORKFLOW_STEP') {
    const currentStep = workflowCurrentStep(err);
    return currentStep !== undefined
      ? { kind: 'reconcile', currentStep }
      : { kind: 'reconcileRefresh' };
  }
  if (err.status === 409) return { kind: 'locked' };
  if (err.status === 403) return { kind: 'unassigned' };
  if (err.status === 0) return { kind: 'offline', message: err.message };
  return { kind: 'generic', message: err.message };
}