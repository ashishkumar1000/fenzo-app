/**
 * useWorkflowAdvance — the advance state machine behind the technician job
 * detail's action bar and stepper (Story 3.3): one in-flight step, the bar's
 * inline error, and the failure branches from `classifyAdvanceError`.
 *
 * Extracted from TechJobDetailScreen so the screen keeps fetch/refresh and
 * this file owns only the mutation lifecycle. The race hardening:
 *
 * - `pendingRef` is the real double-tap guard (state alone races React's
 *   batching between taps).
 * - `keyRef` mints the idempotency key ONCE per action and reuses it until
 *   the server actually answers — Epic 4 replays the SAME key for a queued
 *   action. An offline failure (status 0) keeps the key so a retry is still
 *   the same submit; any server response clears it.
 * - Every success/reconcile bumps `detailGenRef` FIRST, so a refetch that is
 *   already in flight (started before the mutation) can't commit its stale
 *   pre-mutation response over the fresh local truth.
 * - A success or reconcile chains a silent refetch (`load(false)`) — server
 *   truth (activity log, presigned URLs) resyncs without any UI spin. The
 *   screen's own refetches clear any stale inline error through
 *   `clearActionError` — fresh truth invalidates old failure copy.
 */
import { useCallback, useRef, useState } from 'react';
import { jobService, type ApiError, type JobDetail } from '../../services';
import { generateIdempotencyKey } from '../../utils/idempotency';
import { STEP_ORDER, type WorkflowStep } from './stepperModel';
import { apiJobOf, upsertTechnicianJob } from './useTechnicianJobs';
import { classifyAdvanceError, JOB_LOCKED_MESSAGE } from './workflowActionBarModel';

type Params = {
  jobId: string | undefined;
  /** The open detail — mirrored into a ref so async branches see the latest. */
  detail: JobDetail | null;
  /** The detail's setter (functional updates keep concurrent patches safe). */
  setDetail: (update: (current: JobDetail | null) => JobDetail | null) => void;
  /**
   * Bumped by the screen whenever local truth moves ahead of a started
   * refetch — the refetch discards its stale commit. Bumped here on every
   * success/reconcile (see header).
   */
  detailGenRef: { current: number };
  /** The screen's silent refetch (no spinner); also called for reconcile. */
  load: (showSpinner?: boolean) => Promise<void>;
  /** 403 — the job was reassigned away; the screen routes to its unassigned view. */
  onUnassigned: (error: ApiError) => void;
};

export function useWorkflowAdvance({
  jobId,
  detail,
  setDetail,
  detailGenRef,
  load,
  onUnassigned,
}: Params) {
  const [pendingStep, setPendingStep] = useState<WorkflowStep | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // The real double-tap guard — plain state can't close the window between
  // React's render passes.
  const pendingRef = useRef(false);
  // The idempotency key for the in-flight (or retryable-offline) action.
  const keyRef = useRef<string | null>(null);
  // Latest detail for the async branches — the callback can't close over it.
  const detailRef = useRef(detail);
  detailRef.current = detail;

  const advance = useCallback(
    async (step: WorkflowStep) => {
      if (!jobId || pendingRef.current) return;
      pendingRef.current = true;
      setPendingStep(step);
      setActionError(null);
      // TODO(3.5): for step === 'signature_captured', navigate to the
      // Signature screen ({ jobId }) instead of posting directly — this
      // direct post is the interim dev path until 3.5 merges.
      try {
        const key = (keyRef.current ??= generateIdempotencyKey());
        const job = await jobService.advanceWorkflow(jobId, step, key);
        keyRef.current = null; // server answered — a retry may be a new submit
        detailGenRef.current += 1; // the in-flight resync below is now stale-able
        // The response is the post-advance ApiJob: merge into the open detail
        // and into the shared list store. No optimistic activity-log append —
        // the new step's timestamp arrives with the resync below.
        setDetail(d => (d ? { ...d, ...job } : d));
        upsertTechnicianJob(job);
        void load(false);
      } catch (caught) {
        const err = caught as ApiError;
        if (err.status !== 0) keyRef.current = null; // server responded
        const plan = classifyAdvanceError(err);
        switch (plan.kind) {
          case 'reconcile': {
            // 422 step race — silent reconcile: adopt the server's step with
            // NO error UI; the stepper and bar re-derive from it.
            const currentStep = plan.currentStep as WorkflowStep | null;
            // An out-of-vocabulary step can't patch the UI (no stepper row
            // exists for it) — fall back to a refetch instead.
            if (currentStep !== null && !STEP_ORDER.includes(currentStep)) {
              void load(false);
              break;
            }
            detailGenRef.current += 1;
            setDetail(d => (d ? { ...d, currentStep } : d));
            const row = detailRef.current
              ? { ...apiJobOf(detailRef.current), currentStep }
              : null;
            if (row) upsertTechnicianJob(row);
            void load(false);
            break;
          }
          case 'reconcileRefresh':
            // A step race the error body can't describe — refetch silently.
            void load(false);
            break;
          case 'locked':
            // Terminal OR a lost concurrent race (indistinguishable per the
            // BE contract) — fixed copy + full refetch to land on server
            // truth. The copy is set AFTER the refetch: fresh detail clears
            // the inline error, and this message must survive it.
            void load(false).then(() => setActionError(JOB_LOCKED_MESSAGE));
            break;
          case 'unassigned':
            // The job was reassigned away mid-advance — the screen's
            // dedicated view (and its leaving Today refetch) takes over.
            onUnassigned(err);
            break;
          case 'offline':
            // EPIC4: enqueue here with keyRef's key — until the offline
            // queue exists, surface the failure inline; the button doubles
            // as the retry (same key, same submit).
            setActionError(plan.message);
            break;
          default:
            setActionError(plan.message);
        }
      } finally {
        pendingRef.current = false;
        setPendingStep(null);
      }
    },
    [jobId, setDetail, detailGenRef, load, onUnassigned],
  );

  return { pendingStep, actionError, clearActionError: () => setActionError(null), advance };
}