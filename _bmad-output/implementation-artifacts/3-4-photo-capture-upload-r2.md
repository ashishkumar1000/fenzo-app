# Story 3.4: Photo Capture & Upload (Three-Phase R2)

Status: ready-for-dev

## Story

As a technician,
I want to attach up to 5 photos as proof of work,
so that the owner has evidence before I leave the site.

## API Contract (api-contracts.md §8–§10)

Phase 1 `POST /jobs/:id/attachments` `{ filename, mimeType ∈ [image/jpeg,image/png,image/heic], attachmentType: 'photo' }` (+ fresh `X-Idempotency-Key`) → `{ presignedPutUrl, uploadId, key, expiresAt }` (URL TTL **900s**). Phase 2 raw `PUT presignedPutUrl` with `Content-Type: <mimeType>`, NO auth header, plain fetch. Phase 3 `POST /jobs/:id/attachments/:uploadId/confirm` `{ sizeBytes ≥ 1 }` → `{ id, type, createdAt }`. Errors: presign 409 photo-limit / 422 mime; confirm 404 `RESOURCE_NOT_FOUND`, **410 `UPLOAD_EXPIRED`**, 409 limit. First photo confirm auto-advances `photos_uploaded` server-side. NEVER retry a stale presigned URL; NEVER persist uploadIds across sessions.

## UI Design (ui-design-spec.md §10)

3-column square-tile grid (gap s2, radius.md) inside the Photos SectionCard. Tile states: confirmed = Image cover; in-flight = local preview + scrim overlay + white spinner + white caption phase word ("Preparing"/"Uploading"/"Saving"); failed = dimmed image + bottom strip cancelled.bg with caption "Failed" + RefreshCw (whole tile = retry); waiting-to-sync (4.2) = bottom strip scheduled.bg "Waiting to sync"; offline-no-url (4.1) = surfaceSunken + ImageOff + "Available online". Add tile = dashed borderDefault + Plus 22 primary + caption "Add photo"; limit-disabled = borderSubtle + textDisabled + "Limit reached (5)". Below-grid caption: "Up to 5 photos · JPG, PNG or HEIC · max 10 MB"; validation errors as an InlineError line under the grid. Camera/gallery choice via native `Alert.alert('Add photo', …)`. Copy from spec §15.

## Acceptance Criteria

1. **Given** the Photos section on a non-terminal job with < 5 photos, **then** an add tile opens an ActionSheet-style choice: "Take photo" (`launchCamera({ mediaType:'photo', quality: 0.8, saveToPhotos: false })`) / "Choose from gallery" (`launchImageLibrary({ mediaType:'photo', selectionLimit: Math.min(5 - photoCount, 5) })`); Android runtime CAMERA permission requested before launchCamera (`PermissionsAndroid.request`), denial → inline copy "Camera permission is needed to take photos".
2. **Given** each selected asset, **then** client-side validation BEFORE any request: `type` ∈ the 3 allowed mimes (HEIC from iOS camera passes through untranscoded) and `fileSize ≤ 10 * 1024 * 1024`; violations render inline per-file copy ("Only JPG, PNG or HEIC up to 10 MB") and are skipped.
3. **Given** a valid file, **then** the per-file state machine runs `presigning → uploading → confirming → done | failed` with a progress overlay on its tile; multiple files upload in parallel (one presign each); a `failed` tile shows Retry.
4. **Given** ANY failure OR `Date.now() > new Date(expiresAt).getTime()` before the PUT completes, **then** Retry restarts the WHOLE action from presign with a FRESH idempotency key (the old presigned URL is never reused — api-contracts.md §8 warning).
5. **Given** a presign/confirm 409, **then** the add tile disables with "Photo limit reached (5)" and the failed tile clears; **given** confirm 410, **then** auto-restart from presign once, then surface Retry.
6. **Given** a successful confirm, **then** the detail refetches (fresh read URLs + server-advanced `photos_uploaded` when applicable — closes Story 3.3 AC 3) and the grid re-renders from `detail.attachments`.
7. The pipeline is exposed as a reusable hook `useAttachmentUpload(jobId, attachmentType)` — Story 3.5 reuses it for signatures; the state machine cleanly exposes the post-PUT/pre-confirm boundary (Epic 4 queues confirms from exactly that state).

## Tasks / Subtasks

- [ ] **Task 0 — Install** `bun add react-native-image-picker` + `cd ios && pod install`; Info.plist: `NSCameraUsageDescription` "Take photos of completed work", `NSPhotoLibraryUsageDescription` "Attach photos of completed work"; AndroidManifest: `<uses-permission android:name="android.permission.CAMERA" />` (the library needs no storage permission on modern Android via Photo Picker). Record installed version + any RN 0.86 patching in Dev Agent Record.
- [ ] **Task 1 — Service** (`services/resources/attachments.ts`, new):
  ```ts
  export interface PresignResponse { presignedPutUrl: string; uploadId: string; key: string; expiresAt: string }
  export interface ConfirmResponse { id: string; type: 'photo' | 'signature'; createdAt: string }
  async function requestUpload(jobId: string, body: { filename: string; mimeType: string; attachmentType: 'photo' | 'signature' }, idemKey: string): Promise<PresignResponse> { const res = await apiClient.post(`/jobs/${jobId}/attachments`, body, { headers: { 'X-Idempotency-Key': idemKey } }); return res.data; }
  async function confirmUpload(jobId: string, uploadId: string, sizeBytes: number, idemKey: string): Promise<ConfirmResponse> { const res = await apiClient.post(`/jobs/${jobId}/attachments/${uploadId}/confirm`, { sizeBytes }, { headers: { 'X-Idempotency-Key': idemKey } }); return res.data; }
  export const attachmentService = { requestUpload, confirmUpload };
  ```
  Barrel export.
- [ ] **Task 2 — PUT transport** (`src/utils/r2Upload.ts`, new):
  ```ts
  export async function putToPresignedUrl(url: string, fileUri: string, mimeType: string): Promise<number> {
    const blob = await (await fetch(fileUri)).blob();            // RN blob from local uri
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: blob });
    if (!res.ok) throw new Error(`R2 PUT failed: ${res.status}`);
    return blob.size;                                            // authoritative sizeBytes for confirm
  }
  ```
  Plain fetch on purpose (no Bearer header, different host). If RN 0.86's fetch-blob path misbehaves with HEIC, fall back to `body: { uri: fileUri } as any` (works on RN's native networking) — spike both, record which shipped.
- [ ] **Task 3 — Upload hook** (`features/technicianApp/useAttachmentUpload.ts`, new): per-file entries `{ localId, fileUri, filename, mimeType, phase: 'presigning'|'uploading'|'confirming'|'done'|'failed', uploadId?, error? }`; `start(files)` runs entries in parallel:
  presign(freshKey) → putToPresignedUrl → confirm(freshKey, sizeBytes from PUT) → phase done → `onConfirmed()` callback (screen refetches). `retry(localId)` → reset entry → full restart (AC 4). Expiry pre-check before PUT (AC 4). 410 on confirm → one silent auto-restart (guard flag) → then failed. 409 anywhere → `onLimit()` callback + drop entry.
- [ ] **Task 4 — PhotoSection UI** (`features/technicianApp/components/PhotoSection.tsx`, new): grid of confirmed thumbnails (from `detail.attachments` where type photo) + in-flight tiles (local uri preview + phase overlay: small spinner + phase word) + add tile (Plus icon; hidden/disabled per limit incl. in-flight count: `confirmed + inFlightActive >= 5`); wire into TechJobDetailScreen's reserved slot; hidden on terminal jobs.
- [ ] **Task 5 — Picker plumbing** (`features/technicianApp/photoPicker.ts`, new): wraps launchCamera/launchImageLibrary → normalized `{ fileUri, filename, mimeType, fileSize }[]`; validation of AC 2 lives here (pure, testable): `export function validateAsset(a): string | null`.
- [ ] **Task 6 — Tests**: validateAsset (each mime, boundary 10MB exact = pass, +1 byte = fail, unknown type); state-machine transitions incl. expiry restart, 410 single auto-retry, 409 limit drop; parallel entries independent; retry uses a NEW idempotency key (assert keys differ).

## Dev Notes

- `sizeBytes` sent to confirm = the blob size measured at PUT time (server treats it as informational, BE A2) — never the picker's possibly-absent fileSize.
- Photo count for the limit = CONFIRMED server photos + local in-flight (pessimistic; a server 409 remains the backstop).
- Do not add react-native-fs or blob-util — the fetch-blob path avoids new native deps.
- Epic-4 seam: the hook's `confirming` phase must be enterable directly with `{ uploadId, sizeBytes }` (export `confirmOnly(entry)`) so the queue can replay a confirm without re-PUTting.
- Files: NEW `services/resources/attachments.ts`, `src/utils/r2Upload.ts`, `features/technicianApp/useAttachmentUpload.ts`, `features/technicianApp/components/PhotoSection.tsx`, `features/technicianApp/photoPicker.ts`; MODIFY barrel, `TechJobDetailScreen.tsx`, ios/Info.plist, android/app/src/main/AndroidManifest.xml; tests.
- [Source: api-contracts.md §8–§10; fenzit-be attachments.service.ts (MIME_TO_EXT, PRESIGNED_TTL 900, count-on-confirmed L119–144, 410 path L265–276); deferred A2/A5/CR3.6-1; web check 2026-09-01: react-native-image-picker new-arch support].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
