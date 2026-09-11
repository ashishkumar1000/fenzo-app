/**
 * useSignatureSave — the Save orchestration of `SignatureScreen`, extracted
 * verbatim (file split, behaviour unchanged): export → upload → advance →
 * pop, plus its guards and failure branches. The screen keeps the pad ref,
 * the stroke state and the chrome; everything that talks to the network or
 * the route lives here.
 *
 * Story 5.2 deferred: the advance call now uses the job's actual signature
 * step key (from `stepKey` prop) instead of the hardcoded 'signature_captured'.
 * The 422 reconcile checks against the job's template steps array instead of
 * the global STEP_ORDER.
 *
 * The sequence is deliberately resumable: `confirmedThisSession` latches
 * after a successful upload so a hard advance failure (offline) retries ONLY
 * the advance on the next Save — the bytes are already stored and
 * re-uploading would fork the attachment. `resetForNewDrawing` clears the
 * latch: a cleared pad is a fresh drawing, so the next Save must re-upload
 * (the server's last-write-wins replaces the old signature). A 422 on the
 * advance (step already recorded — an offline race) reconciles silently and
 * still pops, mirroring 3.3 AC 5; a 422 whose server currentStep is BEFORE
 * the signature step is a real rejection and surfaces as an error.
 *
 * A failed upload keeps the screen (and the drawing) up — the caller never
 * clears the pad on failure. A network-class failure (status 0) gets the
 * story's offline copy instead of the raw transport message.
 * // EPIC4: NetInfo gate — Epic 4 swaps the post-failure copy for a
 * pre-flight reachability check.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { jobService, type ApiError } from '../../services';
import { workflowCurrentStep } from '../../services/api/apiError';
import { generateIdempotencyKey } from '../../utils/idempotency';
import { useAttachmentUpload } from './useAttachmentUpload';
import { errorMessage } from './attachmentUploadModel';
import { SIGNATURE_MIME_TYPE, signatureFilename } from '../../utils/signatureExport';
import type { WorkflowTemplateStep } from '../../services/resources/jobs';

/** AC 7's offline copy — shown for a network-class failure until Epic 4's
 * pre-flight reachability check lands (// EPIC4: NetInfo gate). */
const OFFLINE_COPY = 'Signature upload needs internet.';

type Props = {
  jobId: string | undefined;
  /** The signature step's key in the job's template. */
  stepKey: string | undefined;
  /** The job's workflow template steps — used for reconcile checks. */
  steps: WorkflowTemplateStep[] | undefined;
  /** The pop used on success — plain `goBack` (the Signature screen is
   *  always a pushed route; the missing-jobId entry path leaves via the
   *  screen's `goBackSafely` instead). */
  pop: () => void;
};

export function useSignatureSave({ jobId, stepKey, steps, pop }: Props) {
  const { uploadOne } = useAttachmentUpload({
    jobId,
    attachmentType: 'signature',
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Latched once the upload confirms: a retry after that must only re-run the
  // advance, never re-upload (the bytes are already stored — see header).
  const confirmedThisSession = useRef(false);
  // Real busy guard: state alone can't close the window between the Save tap
  // and the native readSignature roundtrip that fires onOK.
  const busyRef = useRef(false);
  // The save chain outlives the screen (user can hit back mid-upload) — an
  // unmounted screen must not pop the route underneath or setState.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submitSignature = useCallback(
    async (dataUri: string) => {
      if (!jobId || !stepKey || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        if (!confirmedThisSession.current) {
          await uploadOne({
            fileUri: dataUri,
            filename: signatureFilename(jobId),
            mimeType: SIGNATURE_MIME_TYPE,
          });
          confirmedThisSession.current = true;
        }
        try {
          await jobService.advanceWorkflow(
            jobId,
            stepKey,
            generateIdempotencyKey(),
          );
        } catch (caught) {
          // A 422 whose body names this stepKey (or a later step) means
          // the step is already recorded (an offline race) — that IS success.
          // An earlier currentStep is a real rejection — the step never
          // happened — and must surface as the inline error.
          const currentStep = workflowCurrentStep(caught as ApiError);
          // An unknown step string also reconciles to "not recorded" — the
          // server's vocabulary is the source of truth here.
          let recorded = false;
          if (currentStep != null && steps && steps.length > 0 && stepKey) {
            const currentStepIndex = steps.findIndex(s => s?.key === currentStep);
            const signatureStepIndex = steps.findIndex(s => s?.key === stepKey);
            recorded = currentStepIndex >= 0 && signatureStepIndex >= 0 && currentStepIndex >= signatureStepIndex;
          }
          if (!recorded) throw caught;
        }
        if (mountedRef.current) pop();
      } catch (caught) {
        // A network-class failure (status 0) is not a server verdict — show
        // the story's offline copy instead of the raw transport message.
        setError(
          (caught as ApiError).status === 0
            ? OFFLINE_COPY
            : errorMessage(caught),
        );
      } finally {
        busyRef.current = false;
        if (mountedRef.current) setBusy(false);
      }
    },
    [jobId, stepKey, steps, pop, uploadOne],
  );

  const resetForNewDrawing = useCallback(() => {
    // A cleared pad is a fresh drawing: the latch no longer describes what's
    // on the pad, so the next Save re-uploads (server last-write-wins).
    confirmedThisSession.current = false;
    setError(null);
  }, []);

  /** A broken pad has no drawing to save — surface it as the inline error
   *  (the caller also disables Save via its own stroke state). */
  const reportPadFailure = useCallback(() => {
    setError('Signature pad failed to load — go back and try again.');
  }, []);

  return { busy, error, submitSignature, resetForNewDrawing, reportPadFailure };
}