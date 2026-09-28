/**
 * useSetupWizard — the wizard's server-authoritative progress state
 * (Story 15-8).
 *
 * Owns exactly the things the step screens must not: the mount-time
 * start-or-resume (`GET /attendance/setup` → POST start when never
 * started), the step-marker advance (`PATCH` on Continue/Skip only — data
 * writes belong to the step's own screens), the completion call, and the
 * exit signals. No MMKV mirror: progress survives closing the app or
 * switching phones because the server holds it (FR-1); this hook holds
 * only the current render's view of that truth.
 *
 * Failure contracts (matrix):
 *  - Bootstrap GET/start failure → `bootstrapError` (InlineError + Retry
 *    on the wizard's first screen); nothing marked.
 *  - Advance PATCH failure → `advanceError` retry banner on the step; the
 *    wizard does not advance and nothing entered is lost. 404
 *    `ATTENDANCE_SETUP_NOT_STARTED` (rows wiped server-side) restarts via
 *    POST start and surfaces the banner for a Retry re-PATCH. 409
 *    `ATTENDANCE_SETUP_ALREADY_COMPLETED` (another device finished
 *    mid-wizard) → `exitReason:'completed-elsewhere'` → leave to
 *    AttendanceHome.
 *  - Completion 422 `ATTENDANCE_SETUP_INCOMPLETE` (server gate unmet
 *    despite the client gate — a race) → `completionError` banner +
 *    `onSetupIncomplete` refetch; never a fake success.
 *
 * Every submit latches in a ref (the `useWeeklyOffDefaultForm` pattern):
 * `isAdvancing`/`isCompleting` are async state, so a second press in the
 * window before re-render would double-PATCH or double-complete.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceSetupService } from '../../../services';
import type { ApiError, SetupStep } from '../../../services';
import { SETUP_STEPS, nextStep, previousStep } from './wizardModel';

/** Why the wizard left for AttendanceHome. `completed` — the owner's own
 *  "Enable attendance" succeeded; `completed-elsewhere` — setup was
 *  already complete when the wizard loaded or raced mid-wizard. */
export type WizardExitReason = 'completed' | 'completed-elsewhere';

export interface UseSetupWizardOptions {
  /** Fired when the completion POST is rejected 422
   *  `ATTENDANCE_SETUP_INCOMPLETE` — the screen refetches offices and the
   *  roster so the client gate recomputes from fresh server truth. */
  onSetupIncomplete?: () => void;
}

export interface UseSetupWizardResult {
  /** Mount-time start-or-resume in flight (the wizard's first spinner). */
  isLoading: boolean;
  bootstrapError: ApiError | null;
  /** The step the wizard renders; null until bootstrapped. */
  currentStep: SetupStep | null;
  isAdvancing: boolean;
  advanceError: ApiError | null;
  isCompleting: boolean;
  completionError: ApiError | null;
  exitReason: WizardExitReason | null;
  retryBootstrap: () => void;
  /** Continue / Skip-for-now: PATCHes the NEXT step's marker; on success
   *  the wizard renders that step. */
  advance: () => void;
  /** In-session Back: steps backward in place. The server marker never
   *  moves backward — it only advances on Continue. */
  back: () => void;
  /** "Enable attendance": POST /setup/complete. */
  complete: () => void;
}

export function useSetupWizard(
  options: UseSetupWizardOptions = {},
): UseSetupWizardResult {
  const { onSetupIncomplete } = options;

  const [isLoading, setIsLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<ApiError | null>(null);
  const [currentStep, setCurrentStep] = useState<SetupStep | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<ApiError | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<ApiError | null>(null);
  const [exitReason, setExitReason] = useState<WizardExitReason | null>(null);

  // Latest-wins for the mount-time bootstrap: a Retry must supersede an
  // earlier in-flight attempt, never interleave with it.
  const bootSeqRef = useRef(0);
  // Submit latches — see the header comment.
  const advancingRef = useRef(false);
  const completingRef = useRef(false);

  const bootstrap = useCallback(async () => {
    const seq = ++bootSeqRef.current;
    setIsLoading(true);
    setBootstrapError(null);
    try {
      let state = await attendanceSetupService.getSetup();
      if (seq !== bootSeqRef.current) return;
      if (state.setupCompletedAt !== null) {
        // Completed (here or on another device) — the wizard never renders.
        setExitReason('completed-elsewhere');
        return;
      }
      if (!state.started) {
        // First run — start it (idempotent; 201 first / 200 resume).
        state = await attendanceSetupService.startSetup();
        if (seq !== bootSeqRef.current) return;
      }
      // Consume-seam guard: the resource layer normalizes nullish, but a
      // garbage/unknown step VALUE from the wire must never enter the step
      // machine (stepIndex would be −1, "Step 0 of 5") — fall back to the
      // first step. Unreachable via the shipped DB CHECK; cheap insurance.
      const resumed = state.currentStep;
      setCurrentStep(
        resumed !== null && SETUP_STEPS.includes(resumed) ? resumed : 'offices',
      );
    } catch (err) {
      if (seq !== bootSeqRef.current) return;
      const apiError = err as ApiError;
      if (apiError.code === 'ATTENDANCE_SETUP_ALREADY_COMPLETED') {
        setExitReason('completed-elsewhere');
        return;
      }
      setBootstrapError(apiError);
    } finally {
      if (seq === bootSeqRef.current) setIsLoading(false);
    }
  }, []);

  // Run once per mount — the wizard is a route, not a tab; re-entry goes
  // through a fresh mount and a fresh read of server truth.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void bootstrap();
  }, [bootstrap]);

  const retryBootstrap = useCallback(() => {
    void bootstrap();
  }, [bootstrap]);

  const advance = useCallback(async () => {
    if (!currentStep || advancingRef.current || exitReason) return;
    const target = nextStep(currentStep);
    if (!target) return; // Employees is final — Enable owns it.
    advancingRef.current = true;
    setIsAdvancing(true);
    setAdvanceError(null);
    try {
      await attendanceSetupService.saveSetupStep(target);
      setCurrentStep(target);
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.code === 'ATTENDANCE_SETUP_ALREADY_COMPLETED') {
        // Another device finished mid-wizard — leave; never retry.
        setExitReason('completed-elsewhere');
      } else if (apiError.code === 'ATTENDANCE_SETUP_NOT_STARTED') {
        // Progress rows wiped server-side (MCP-verified only) — restart
        // the wizard via POST start, then surface the banner so Retry
        // re-PATCHes the same marker against the fresh progress row.
        try {
          await attendanceSetupService.startSetup();
          setAdvanceError(apiError);
        } catch (restartErr) {
          const restartError = restartErr as ApiError;
          if (restartError.code === 'ATTENDANCE_SETUP_ALREADY_COMPLETED') {
            setExitReason('completed-elsewhere');
          } else {
            setAdvanceError(restartError);
          }
        }
      } else {
        setAdvanceError(apiError);
      }
    } finally {
      advancingRef.current = false;
      setIsAdvancing(false);
    }
  }, [currentStep, exitReason]);

  const back = useCallback(() => {
    setCurrentStep((step) => {
      if (!step) return step;
      return previousStep(step) ?? step;
    });
  }, []);

  const complete = useCallback(async () => {
    if (completingRef.current || exitReason) return;
    completingRef.current = true;
    setIsCompleting(true);
    setCompletionError(null);
    try {
      await attendanceSetupService.completeSetup();
      setExitReason('completed');
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.code === 'ATTENDANCE_SETUP_ALREADY_COMPLETED') {
        setExitReason('completed-elsewhere');
      } else {
        setCompletionError(apiError);
        if (apiError.code === 'ATTENDANCE_SETUP_INCOMPLETE') {
          // The server's gates are the authority — refetch the data the
          // client gate mirrors so the caption explains what is missing.
          onSetupIncomplete?.();
        }
      }
    } finally {
      completingRef.current = false;
      setIsCompleting(false);
    }
  }, [exitReason, onSetupIncomplete]);

  return {
    isLoading,
    bootstrapError,
    currentStep,
    isAdvancing,
    advanceError,
    isCompleting,
    completionError,
    exitReason,
    retryBootstrap,
    advance,
    back,
    complete,
  };
}
