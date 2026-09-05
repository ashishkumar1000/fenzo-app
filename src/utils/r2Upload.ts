/**
 * r2Upload.ts
 * ───────────
 * The middle phase of the attachment upload: pushing the file's raw bytes to
 * a presigned R2 URL. Deliberately a plain `fetch` — NOT the shared
 * `apiClient` — because this request goes to the R2 host (a different origin
 * from the API) and must carry NO Authorization header: the presigned URL's
 * query signature is the only credential, so anything extra risks a
 * signature mismatch.
 *
 * Resolves with the byte size the PUT actually sent (the blob's own size) —
 * that value, not the picker's possibly-absent `fileSize`, is what the
 * confirm phase sends as `sizeBytes`.
 *
 * The per-file size cap (`maxBytes`, injected by `useAttachmentUpload` from
 * `photoPicker.MAX_BYTES`) is enforced HERE, after the read and BEFORE the
 * PUT: a picker that omits `fileSize` (normalized to 0) would otherwise slip
 * past the client-side validation, and the true byte count is only known
 * once the file is read. An oversized file throws without PUTting a byte.
 *
 * Retry policy lives entirely with the caller (`useAttachmentUpload`): a
 * failed or expired presigned URL is never re-PUT to — a retry always starts
 * over from a fresh presign.
 *
 * Transport note (device-verified 2026-09-05): the file's Blob is created
 * via XMLHttpRequest with `responseType: 'blob'`, NOT `fetch(uri).blob()` —
 * an iOS device run showed the fetch-created blob failing the presigned PUT
 * with `TypeError: Network request failed` (known RN blob incompatibility —
 * react-native#22681; expo/firebase-storage-upload-example#13). The XHR blob
 * is the long-standing workaround. The PUT itself stays on `fetch`.
 *
 * The XHR read also cannot handle `data:` URIs (the signature pad's export):
 * RN's XHR resolves one as a 0-byte blob (RN's documented XHR data-URL
 * handling; NOT yet device-verified — the 3.5 on-device smoke test is
 * pending, see the story's Dev Agent Record). A PUT would send nothing and
 * the pipeline would reject the empty upload. Data URIs therefore skip the
 * read AND the Blob entirely: the base64 payload is decoded in JS
 * (`utils/base64`) and the Uint8Array goes straight into the fetch body —
 * RN's network layer converts ArrayBuffer views to raw bytes natively
 * (convertRequestBody), byte-exact on both platforms. A Blob built from a
 * binary string would be UTF-8-mangled here, so it is never an option for
 * binary payloads.
 */
import { base64ToUint8Array } from './base64';

/**
 * Deadline for both the file read and the PUT. A hung request must not leave
 * the tile on "Uploading" forever with no affordance — past the deadline the
 * attempt fails, landing the tile on Retry (which restarts from presign).
 */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Extracts and decodes the payload of a `data:<mime>;base64,<payload>` URI,
 * or returns null for anything that is not a data URI at all (the `file://`
 * URIs the photo picker hands us). A data URI WITHOUT the base64 marker is
 * rejected explicitly: falling through to the XHR read would produce the
 * 0-byte blob described in the header — a silent empty upload is worse than
 * a loud failure.
 */
function dataUriBytes(fileUri: string): Uint8Array | null {
  if (!fileUri.startsWith('data:')) return null;
  const match = /^data:[^,]*;base64,(.*)$/.exec(fileUri);
  if (!match) {
    throw new Error(`unsupported data URI (expected base64): ${fileUri.slice(0, 40)}…`);
  }
  return base64ToUint8Array(match[1]);
}

/** Reads a local `file://` uri into a Blob via XHR (see the module header). */
function readBlob(fileUri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const timer = setTimeout(() => {
      xhr.abort();
      reject(new Error('timed out reading the file'));
    }, REQUEST_TIMEOUT_MS);
    const stopTimer = () => clearTimeout(timer);
    xhr.onerror = () => {
      stopTimer();
      reject(new Error(`could not read the file (${fileUri})`));
    };
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      stopTimer();
      const blob = xhr.response as Blob | null;
      if (blob && typeof blob.size === 'number') resolve(blob);
      else reject(new Error(`could not read the file (${fileUri})`));
    };
    xhr.open('GET', fileUri);
    xhr.responseType = 'blob';
    xhr.send();
  });
}

export async function putToPresignedUrl(
  url: string,
  fileUri: string,
  mimeType: string,
  maxBytes: number,
): Promise<number> {
  const dataBytes = dataUriBytes(fileUri);
  const blob = dataBytes === null ? await readBlob(fileUri) : null;
  const size = dataBytes !== null ? dataBytes.byteLength : blob!.size;
  if (size > maxBytes) {
    throw new Error(`file exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit`);
  }
  // AbortController deadline: a hung R2 request rejects instead of pinning
  // the tile on "Uploading" forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: dataBytes ?? blob!,
      signal: controller.signal,
    });
  } catch (caught) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      throw new Error('R2 PUT timed out');
    }
    throw caught;
  }
  clearTimeout(timer);
  if (!res.ok) {
    throw new Error(`R2 PUT failed: ${res.status}`);
  }
  return size;
}
