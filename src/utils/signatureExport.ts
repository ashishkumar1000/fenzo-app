/**
 * signatureExport.ts
 * ──────────────────
 * The bridge between the signature pad (Story 3.5's `SignatureScreen`) and
 * the shipped R2 upload pipeline (`useAttachmentUpload` + `r2Upload`).
 *
 * The pad's `onOK` hands back a PNG data URI — `data:image/png;base64,<…>`.
 * That URI is passed to `putToPresignedUrl` AS the `fileUri`, where
 * `r2Upload`'s data-URI branch intercepts it: the base64 payload is decoded
 * in JS (`utils/base64`) and the Uint8Array goes straight into the fetch
 * body — RN's XHR CANNOT read a data URI (it resolves to a 0-byte blob),
 * which is exactly why the decode branch exists. Never reintroduce a
 * Blob/XHR read of a data URI, and never `fetch(dataUri).blob()`
 * (react-native#22681, device-verified against this same pipeline in
 * Story 3.4).
 */

/** The wire mime every phase of the signature upload carries (§8–§10). */
export const SIGNATURE_MIME_TYPE = 'image/png' as const;

/**
 * The filename the presign body carries. Deterministic per job: the backend
 * keys the (single) signature by job, and a re-confirm REPLACES the old one —
 * the name is only ever an upload label, never a lookup key (old uploadIds
 * 404 on re-confirm, per CR3.6-4 — never store them).
 */
export function signatureFilename(jobId: string): string {
  return `signature-${jobId}.png`;
}
