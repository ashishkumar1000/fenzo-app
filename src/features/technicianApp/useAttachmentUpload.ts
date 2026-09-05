/**
 * useAttachmentUpload — the React wiring around the per-file upload pipeline
 * (Story 3.4; the state machine itself lives in `attachmentUploadModel`).
 * Owns the tile entries the Photos section renders, one pipeline per file
 * running in parallel, and the two callbacks the screen routes:
 *
 *   onConfirmed — fired per confirmed file; the screen refetches the detail
 *                 (fresh read URLs + the server-advanced `photos_uploaded`).
 *   onLimit     — fired on a 409 from presign or confirm; the screen
 *                 disables the add tile ("Photo limit reached (5)") and the
 *                 409'd entry is dropped (it never became a photo).
 *
 * Idempotency keys are minted fresh per API call via `generateIdempotencyKey`
 * — a retry therefore restarts the whole action from presign (the contract's
 * "never reuse a stale presigned URL" rule, enforced inside the model).
 *
 * Story 3.5 reuses this hook for signatures by passing
 * `attachmentType: 'signature'`; Epic 4's offline queue replays confirms
 * directly through `confirmOnly` (re-exported from the model) at the
 * post-PUT/pre-confirm boundary.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { attachmentService } from '../../services';
import { generateIdempotencyKey } from '../../utils/idempotency';
import { putToPresignedUrl } from '../../utils/r2Upload';
import { MAX_BYTES } from './photoPicker';
import {
  runUploadPipeline,
  type UploadDeps,
  type UploadEntry,
} from './attachmentUploadModel';

/** Epic-4 seam: complete a stored upload's confirm without re-PUTting. */
export { confirmOnly } from './attachmentUploadModel';

/** A picker output the hook accepts (normalized by `photoPicker`). */
export type PickedFile = {
  fileUri: string;
  filename: string;
  /** One of image/jpeg | image/png | image/heic — validated before `start`. */
  mimeType: string;
  /** Informational; the pipeline measures the real size at PUT time. */
  fileSize: number;
};

type Params = {
  jobId: string | undefined;
  /** Wire enum — 'photo' here, 'signature' for Story 3.5. */
  attachmentType: 'photo' | 'signature';
  /** Per-file confirm success → the screen refetches the detail. */
  onConfirmed?: () => void;
  /** Presign/confirm 409 → the screen disables the add tile. */
  onLimit?: () => void;
};

export function useAttachmentUpload({ jobId, attachmentType, onConfirmed, onLimit }: Params) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [limitReached, setLimitReached] = useState(false);

  // Latest entries for callbacks (retry's lookup) that must not re-create
  // mid-flight pipelines when state moves.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Callbacks through refs: an in-flight pipeline never captures a stale one.
  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;
  const onLimitRef = useRef(onLimit);
  onLimitRef.current = onLimit;

  const patchEntry = useCallback((next: UploadEntry) => {
    if (!mountedRef.current) return;
    setEntries(current => current.map(e => (e.localId === next.localId ? next : e)));
  }, []);

  const dropEntry = useCallback((localId: string) => {
    if (!mountedRef.current) return;
    setEntries(current => current.filter(e => e.localId !== localId));
  }, []);

  // localIds with a pipeline currently running — the retry double-tap guard
  // (state updates flush asynchronously, so a second tap can still read the
  // stale 'failed' phase from entriesRef before the reset lands).
  const inFlightRef = useRef<Set<string>>(new Set());

  const runPipeline = useCallback(
    async (entry: UploadEntry) => {
      if (!jobId) return;
      inFlightRef.current.add(entry.localId);
      try {
        const deps: UploadDeps = {
          presign: attachmentService.requestUpload,
          // The real byte count only exists after the read, so the size cap
          // is enforced inside the transport — post-read, pre-PUT (see
          // r2Upload).
          put: (url, fileUri, mimeType) => putToPresignedUrl(url, fileUri, mimeType, MAX_BYTES),
          confirm: attachmentService.confirmUpload,
          now: Date.now,
          freshKey: generateIdempotencyKey,
        };
        const outcome = await runUploadPipeline(jobId, attachmentType, entry, deps, emitted => {
          // A done tile is replaced by the confirmed attachment from the
          // refetch — drop it here; failure/limit handled after the run.
          if (emitted.phase === 'done') {
            dropEntry(emitted.localId);
            if (mountedRef.current) onConfirmedRef.current?.();
          } else {
            patchEntry(emitted);
          }
        });
        if (outcome === 'limit') {
          dropEntry(entry.localId);
          if (mountedRef.current) {
            setLimitReached(true);
            onLimitRef.current?.();
          }
        }
      } finally {
        inFlightRef.current.delete(entry.localId);
      }
    },
    [jobId, attachmentType, patchEntry, dropEntry],
  );

  /**
   * Starts one pipeline per picked file, all in parallel (one presign each).
   * The caller has already validated mime/size (`photoPicker.validateAsset`).
   */
  const start = useCallback(
    (files: PickedFile[]) => {
      if (!jobId || files.length === 0) return;
      const fresh: UploadEntry[] = files.map(f => ({
        localId: generateIdempotencyKey(),
        fileUri: f.fileUri,
        filename: f.filename,
        mimeType: f.mimeType,
        phase: 'presigning' as const,
      }));
      setEntries(current => [...current, ...fresh]);
      // Parallel by construction: each run is its own async chain.
      for (const entry of fresh) void runPipeline(entry);
    },
    [jobId, runPipeline],
  );

  /** AC 4 — retry a failed tile: reset it and restart the WHOLE action. */
  const retry = useCallback(
    (localId: string) => {
      // Double-tap guard: the reset's state update flushes asynchronously, so
      // a second tap can still see the stale 'failed' phase in entriesRef.
      if (inFlightRef.current.has(localId)) return;
      const entry = entriesRef.current.find(e => e.localId === localId);
      if (!entry || entry.phase !== 'failed') return;
      const reset: UploadEntry = {
        ...entry,
        phase: 'presigning',
        uploadId: undefined,
        sizeBytes: undefined,
        error: undefined,
      };
      patchEntry(reset);
      void runPipeline(reset);
    },
    [patchEntry, runPipeline],
  );

  return { entries, limitReached, start, retry };
}
