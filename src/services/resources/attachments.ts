/**
 * services/resources/attachments.ts
 * ────────────────────────────────
 * The two API phases of the R2 attachment upload (api-contracts §8–§10).
 * The middle phase — the raw `PUT` of the bytes to the presigned URL — does
 * NOT go through here: it hits the R2 host, not this API, and must carry no
 * auth header. That transport lives in `utils/r2Upload.ts`.
 *
 *   Phase 1  `POST /jobs/:id/attachments`           → presigned PUT URL
 *   Phase 2  `PUT <presignedPutUrl>` (raw fetch)    → bytes stored
 *   Phase 3  `POST /jobs/:id/attachments/:uploadId/confirm` → attachment row
 *
 * Both calls here send a caller-minted idempotency key in the
 * `X-Idempotency-Key` header. Only PRESIGN is actually idempotent on the
 * backend (`IdempotencyInterceptor`): it replays a stored response for 24h
 * per key, so reusing a key there would return a stale presign — and a stale
 * URL is never safe to PUT to. The backend's confirm endpoint has NO such
 * interceptor (the header is ignored there; re-executing a confirm is safe
 * but is re-execution, not key-based replay) — the key is still sent for
 * forward compatibility. A retry of either phase mints a FRESH key. The
 * orchestrating state machine is `features/technicianApp/useAttachmentUpload`;
 * this file stays a thin function object on the shared `apiClient` (same
 * shape as `jobs.ts`).
 *
 * Rejects with `ApiError` on failure. Documented failures:
 *   presign  409 photo limit · 422 mime/shape
 *   confirm  404 uploadId unknown · 410 presign expired · 409 photo limit
 */
import { apiClient } from '../api/apiClient';

/** `POST /jobs/:id/attachments` — phase 1. The URL's TTL is 900s. */
export interface PresignResponse {
  presignedPutUrl: string;
  /** Opaque id the confirm phase targets. Never persisted across sessions. */
  uploadId: string;
  /** R2 object key the object is stored under. */
  key: string;
  /** ISO 8601 — the presigned URL's expiry; PUTs after it will fail. */
  expiresAt: string;
}

/** Body for the presign call. `attachmentType` is the wire enum. */
export interface AttachmentPresignBody {
  filename: string;
  /** One of `image/jpeg | image/png | image/heic` — the backend's fixed list. */
  mimeType: string;
  attachmentType: 'photo' | 'signature';
}

/** `POST …/confirm` — phase 3; `sizeBytes` is informational (measured at PUT). */
export interface ConfirmResponse {
  id: string;
  type: 'photo' | 'signature';
  /** ISO 8601, UTC. */
  createdAt: string;
}

/**
 * Phase 1 — request a presigned PUT URL for one file.
 *
 * Documented failures: 409 (tenant photo limit already at 5) ·
 * 422 (disallowed mime or bad shape). All surfaced as `ApiError`.
 */
async function requestUpload(
  jobId: string,
  body: AttachmentPresignBody,
  idemKey: string,
): Promise<PresignResponse> {
  const res = await apiClient.post<PresignResponse>(`/jobs/${jobId}/attachments`, body, {
    headers: { 'X-Idempotency-Key': idemKey },
  });
  return res.data;
}

/**
 * Phase 3 — confirm the finished upload, turning it into an attachment row.
 * `sizeBytes` is the byte size measured at PUT time (the blob's own size),
 * never the picker's reported fileSize.
 *
 * Documented failures: 404 (unknown uploadId) · 410 (presign expired —
 * retry restarts the whole upload from presign) · 409 (photo limit). All
 * surfaced as `ApiError`.
 */
async function confirmUpload(
  jobId: string,
  uploadId: string,
  sizeBytes: number,
  idemKey: string,
): Promise<ConfirmResponse> {
  const res = await apiClient.post<ConfirmResponse>(
    `/jobs/${jobId}/attachments/${uploadId}/confirm`,
    { sizeBytes },
    { headers: { 'X-Idempotency-Key': idemKey } },
  );
  return res.data;
}

export const attachmentService = { requestUpload, confirmUpload };