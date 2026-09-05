/**
 * attachmentUploadModel.ts
 * ─────────────────────────
 * The per-file upload pipeline behind Story 3.4 (api-contracts §8–§10):
 * presign → raw PUT → confirm, with the failure branches the contract
 * prescribes. Pure orchestration — every external step is injected, which is
 * what keeps the state machine testable without React, axios or the network.
 * The React wiring lives in `useAttachmentUpload`.
 *
 * Key rules baked in here:
 *   - EVERY attempt mints a fresh idempotency key per API call. The backend
 *     replays a stored response per key for 24h, so reusing one would hand
 *     back a stale presign — and a stale presigned URL is never safe to PUT
 *     to (§8's warning). A retry therefore restarts the WHOLE action.
 *   - The PUT's measured byte size (the blob's own size) is what confirm
 *     receives as `sizeBytes` — never the picker's possibly-absent fileSize.
 *   - An expiry pre-check before the PUT: a presign response past its
 *     `expiresAt` fails immediately, sending the tile to Retry (which
 *     restarts from presign) rather than PUTting bytes into a dead URL.
 *   - confirm 410 (UPLOAD_EXPIRED) auto-restarts from presign exactly ONCE,
 *     silently — a second 410 surfaces Retry. 409 anywhere is a photo-limit
 *     hit, reported as `limit` so the caller can drop the tile and disable
 *     the add tile.
 *
 * Epic-4 seam (AC 7): the post-PUT/pre-confirm boundary is replayable via
 * `confirmOnly` — the offline queue can complete a stored upload without
 * re-PUTting the bytes.
 */
import type { AttachmentPresignBody, ConfirmResponse, PresignResponse } from '../../services';

/** The per-file phases the UI shows. `done` tiles are removed by the caller. */
export type UploadPhase = 'presigning' | 'uploading' | 'confirming' | 'done' | 'failed';

/** One file the pipeline is driving, as the UI's tile model. */
export interface UploadEntry {
  /** Client-side id for the tile (a uuid v4) — never sent to the server. */
  localId: string;
  fileUri: string;
  filename: string;
  /** One of image/jpeg | image/png | image/heic (validated before entry). */
  mimeType: string;
  phase: UploadPhase;
  /** Set from the presign response; identifies the upload through confirm. */
  uploadId?: string;
  /** The byte size measured at PUT time; confirm sends it as `sizeBytes`. */
  sizeBytes?: number;
  /** Human-readable failure copy for debugging; the tile itself shows Retry. */
  error?: string;
}

/** Terminal outcomes of one pipeline run. */
export type UploadOutcome = 'done' | 'failed' | 'limit';

/** The external steps, all injected. See the module header for the contract. */
export interface UploadDeps {
  presign: (jobId: string, body: AttachmentPresignBody, idemKey: string) => Promise<PresignResponse>;
  put: (url: string, fileUri: string, mimeType: string) => Promise<number>;
  confirm: (jobId: string, uploadId: string, sizeBytes: number, idemKey: string) => Promise<ConfirmResponse>;
  /** Wall clock, injectable for the expiry pre-check. */
  now: () => number;
  /** Mints a fresh uuid v4 idempotency key — called once per API call. */
  freshKey: () => string;
}

/** Status of the error the pipeline just handled (undefined otherwise). */
function statusOf(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : 0;
}

/**
 * Human-readable copy for any pipeline failure. The API client rejects with
 * a plain `ApiError` object (not an `Error` instance), so `String()` alone
 * renders "[object Object]" — read `.message` when it's a usable string and
 * fall back to `String()` for genuine Errors (which stringify fine).
 */
function errorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.length > 0 ? message : String(error);
}

/**
 * Drives one file from presign to done/failed/limit, emitting the entry
 * (immutable copies) on every phase change. Runs the 410 auto-restart loop
 * internally; see the module header for the branch semantics.
 */
export async function runUploadPipeline(
  jobId: string,
  attachmentType: 'photo' | 'signature',
  initial: UploadEntry,
  deps: UploadDeps,
  onEntry: (entry: UploadEntry) => void,
): Promise<UploadOutcome> {
  let entry = initial;
  let autoRestarted = false;

  for (;;) {
    // Phase 1 — presign. 409 → the tenant photo limit is already full.
    onEntry({ ...entry, phase: 'presigning', error: undefined });
    let presign: PresignResponse;
    try {
      presign = await deps.presign(
        jobId,
        { filename: entry.filename, mimeType: entry.mimeType, attachmentType },
        deps.freshKey(),
      );
    } catch (caught) {
      if (statusOf(caught) === 409) return 'limit';
      onEntry({ ...entry, phase: 'failed', error: errorMessage(caught) });
      return 'failed';
    }

    // A 200 presign body that is missing its routing fields would otherwise
    // PUT the whole file and only die at confirm (404 on /undefined/confirm)
    // — bytes that can never be confirmed. Fail before the PUT instead.
    if (!presign.presignedPutUrl || !presign.uploadId) {
      onEntry({ ...entry, phase: 'failed', error: 'presign response was incomplete' });
      return 'failed';
    }

    // Expiry pre-check (§8): a stale presign response must not be PUT to —
    // fail here so Retry restarts from a fresh presign. A malformed/missing
    // expiresAt parses to NaN, which would make the comparison false and
    // skip the check — treat "unknown expiry" as expired (fail safe).
    const expiresAtMs = new Date(presign.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || deps.now() > expiresAtMs) {
      onEntry({ ...entry, phase: 'failed', error: 'presign expired' });
      return 'failed';
    }

    // Phase 2 — raw PUT (transport in utils/r2Upload). The presign's uploadId
    // is folded into `entry` itself (not just the emitted copy) so later
    // emissions — and the 410 restart's reset — actually carry it.
    entry = { ...entry, phase: 'uploading', uploadId: presign.uploadId };
    onEntry(entry);
    let sizeBytes: number;
    try {
      sizeBytes = await deps.put(presign.presignedPutUrl, entry.fileUri, entry.mimeType);
    } catch (caught) {
      onEntry({ ...entry, phase: 'failed', error: errorMessage(caught) });
      return 'failed';
    }

    // A 0-byte PUT is never a valid photo — the backend's min(1) would 422
    // confirm; fail here with the same Retry path instead of burning the call.
    if (sizeBytes < 1) {
      onEntry({ ...entry, phase: 'failed', error: 'uploaded file is empty (0 bytes)' });
      return 'failed';
    }

    // Phase 3 — confirm.
    entry = { ...entry, phase: 'confirming', sizeBytes };
    onEntry(entry);
    try {
      await deps.confirm(jobId, presign.uploadId, sizeBytes, deps.freshKey());
      onEntry({ ...entry, phase: 'done' });
      return 'done';
    } catch (caught) {
      if (statusOf(caught) === 409) return 'limit';
      // 410 = the presign expired between PUT and confirm. One silent
      // restart from presign (fresh URL, fresh keys); a second 410 → Retry.
      // The uploadId/sizeBytes just judged dead must not leak into the
      // restarted attempt — they are re-set from the new presign/PUT.
      if (statusOf(caught) === 410 && !autoRestarted) {
        autoRestarted = true;
        entry = { ...entry, uploadId: undefined, sizeBytes: undefined };
        continue;
      }
      onEntry({ ...entry, phase: 'failed', error: errorMessage(caught) });
      return 'failed';
    }
  }
}

/**
 * Epic-4 seam (AC 7): replay JUST the confirm for an upload whose bytes are
 * already stored — the offline queue enters the state machine exactly at the
 * post-PUT/pre-confirm boundary (`uploadId` + `sizeBytes` are what it has).
 * Never re-PUTs; the presigned URL from the original attempt is long dead.
 */
export async function confirmOnly(
  jobId: string,
  uploadId: string,
  sizeBytes: number,
  deps: Pick<UploadDeps, 'confirm' | 'freshKey'>,
): Promise<UploadOutcome> {
  try {
    await deps.confirm(jobId, uploadId, sizeBytes, deps.freshKey());
    return 'done';
  } catch (caught) {
    return statusOf(caught) === 409 ? 'limit' : 'failed';
  }
}
