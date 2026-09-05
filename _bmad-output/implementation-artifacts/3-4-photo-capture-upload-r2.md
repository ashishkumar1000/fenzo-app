---
baseline_commit: fc5a3ec9e207c9fd4d0ba4d87ff75b8690214959
---

# Story 3.4: Photo Capture & Upload (Three-Phase R2)

Status: done

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

- [x] **Task 0 — Install** `bun add react-native-image-picker` + `cd ios && pod install`; Info.plist: `NSCameraUsageDescription` "Take photos of completed work", `NSPhotoLibraryUsageDescription` "Attach photos of completed work"; AndroidManifest: `<uses-permission android:name="android.permission.CAMERA" />` (the library needs no storage permission on modern Android via Photo Picker). Record installed version + any RN 0.86 patching in Dev Agent Record.
- [x] **Task 1 — Service** (`services/resources/attachments.ts`, new):
  ```ts
  export interface PresignResponse { presignedPutUrl: string; uploadId: string; key: string; expiresAt: string }
  export interface ConfirmResponse { id: string; type: 'photo' | 'signature'; createdAt: string }
  async function requestUpload(jobId: string, body: { filename: string; mimeType: string; attachmentType: 'photo' | 'signature' }, idemKey: string): Promise<PresignResponse> { const res = await apiClient.post(`/jobs/${jobId}/attachments`, body, { headers: { 'X-Idempotency-Key': idemKey } }); return res.data; }
  async function confirmUpload(jobId: string, uploadId: string, sizeBytes: number, idemKey: string): Promise<ConfirmResponse> { const res = await apiClient.post(`/jobs/${jobId}/attachments/${uploadId}/confirm`, { sizeBytes }, { headers: { 'X-Idempotency-Key': idemKey } }); return res.data; }
  export const attachmentService = { requestUpload, confirmUpload };
  ```
  Barrel export.
- [x] **Task 2 — PUT transport** (`src/utils/r2Upload.ts`, new):
  ```ts
  export async function putToPresignedUrl(url: string, fileUri: string, mimeType: string): Promise<number> {
    const blob = await (await fetch(fileUri)).blob();            // RN blob from local uri
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: blob });
    if (!res.ok) throw new Error(`R2 PUT failed: ${res.status}`);
    return blob.size;                                            // authoritative sizeBytes for confirm
  }
  ```
  Plain fetch on purpose (no Bearer header, different host). If RN 0.86's fetch-blob path misbehaves with HEIC, fall back to `body: { uri: fileUri } as any` (works on RN's native networking) — spike both, record which shipped.
- [x] **Task 3 — Upload hook** (`features/technicianApp/useAttachmentUpload.ts`, new): per-file entries `{ localId, fileUri, filename, mimeType, phase: 'presigning'|'uploading'|'confirming'|'done'|'failed', uploadId?, error? }`; `start(files)` runs entries in parallel:
  presign(freshKey) → putToPresignedUrl → confirm(freshKey, sizeBytes from PUT) → phase done → `onConfirmed()` callback (screen refetches). `retry(localId)` → reset entry → full restart (AC 4). Expiry pre-check before PUT (AC 4). 410 on confirm → one silent auto-restart (guard flag) → then failed. 409 anywhere → `onLimit()` callback + drop entry.
- [x] **Task 4 — PhotoSection UI** (`features/technicianApp/components/PhotoSection.tsx`, new): grid of confirmed thumbnails (from `detail.attachments` where type photo) + in-flight tiles (local uri preview + phase overlay: small spinner + phase word) + add tile (Plus icon; hidden/disabled per limit incl. in-flight count: `confirmed + inFlightActive >= 5`); wire into TechJobDetailScreen's reserved slot; hidden on terminal jobs.
- [x] **Task 5 — Picker plumbing** (`features/technicianApp/photoPicker.ts`, new): wraps launchCamera/launchImageLibrary → normalized `{ fileUri, filename, mimeType, fileSize }[]`; validation of AC 2 lives here (pure, testable): `export function validateAsset(a): string | null`.
- [x] **Task 6 — Tests**: validateAsset (each mime, boundary 10MB exact = pass, +1 byte = fail, unknown type); state-machine transitions incl. expiry restart, 410 single auto-retry, 409 limit drop; parallel entries independent; retry uses a NEW idempotency key (assert keys differ).

### Review Findings

#### Decision

- [x] [Review][Decision] The shipped blob transport is verified only against a mocked fetch — `putToPresignedUrl` was "spiked" in prose only: every test replaces `globalThis.fetch` with a jest mock, so nothing proves RN's native `fetch` reads a `file://` uri into a Blob with a real `size` or accepts a Blob body for a cross-origin presigned PUT. Modern-Android gallery picks also return `content://` uris, untested on that path entirely. If the blob path misbehaves on-device (e.g. HEIC), every upload fails at the PUT with Retry forever while all jest suites stay green — and the Task-2 fallback (`body: { uri: fileUri }`) is documented but unwired. Options: (a) wire the `{uri}` fallback now behind a runtime check, (b) keep the blob path and record a mandatory device-verification step before commit, (c) device-test now and record the result. [src/utils/r2Upload.ts:24-42] — **Resolved (user, 2026-09-05): option (c) executed via an instrumented device run, and the run caught a REAL bug the mocked tests never could: the original `fetch(fileUri).blob()` blob fails the presigned PUT on iOS with `TypeError: Network request failed` (known RN blob incompatibility — react-native#22681, expo/firebase-storage-upload-example#13). Fix applied: the Blob is now created via XMLHttpRequest with `responseType: 'blob'` (the long-standing workaround); the PUT itself stays on plain `fetch` with an explicit Content-Type. Re-verified end to end on (1) Android physical device — presign → PUT 200 → confirm DONE — and (2) iOS simulator — presign → PUT 200 → confirm DONE. Environment caveat recorded: with the dev Mac's VPN connected, the iOS simulator's PUT to the R2 host fails at the network level (curl HTTP/1.1 reached the host; the sim's HTTP/2 path did not) — VPN off and it passes; not an app defect. Two further device-run fixes: iOS gallery reports JPEG as the non-standard `image/jpg` alias, now canonicalized to `image/jpeg` in `photoPicker.normalize` (was rejected client-side); and `DEV_API_HOST` was temporarily hardcoded to the Mac's LAN IP (`192.168.1.208`) for the physical-Android run — REVERT to the `10.0.2.2`/`localhost` split before commit. Temporary `[PhotoUpload]` debug logs exist in `r2Upload.ts`, `attachmentUploadModel.ts`, `photoPicker.ts`, `PhotoSection.tsx` — remove before commit.**
- [x] [Review][Decision] An unknown `fileSize` bypasses the 10 MB client check entirely — `normalize` sets `fileSize: a.fileSize ?? 0` and `validateAsset` treats 0 as "unknown, pass", so a 40 MB asset the picker couldn't measure is fully PUT to R2 and only fails at confirm (backend caps at 50 MB → 400 `VALIDATION_ERROR`; a 10–50 MB file is even accepted server-side, contradicting the "max 10 MB" client-side intent). AC 2 says validation happens BEFORE any request. Options: (a) enforce the cap at the post-read/pre-PUT boundary — the transport already measures `blob.size` before the PUT, so it can throw past an injected max and land the tile on Retry without uploading, (b) accept the trade-off (client never blocks on a value it doesn't have; server 400/confirm is the backstop) and record it in the story record. [src/features/technicianApp/photoPicker.ts:106-110; src/utils/r2Upload.ts:33] — **Resolved (user, 2026-09-05): option (a) implemented — `putToPresignedUrl` now takes an injected `maxBytes` and throws BEFORE the PUT when the measured blob exceeds it (no bytes uploaded; tile lands on Retry); `useAttachmentUpload` wires `photoPicker.MAX_BYTES` in. Tests: exactly-at-cap passes, cap+1 throws pre-PUT, plus the updated hook-signature assertion.**

#### Patches

- [x] [Review][Patch] Camera launcher errors are swallowed silently — `takePhoto` never checks `res.errorCode` the way `pickFromGallery` does, so an iOS permission denial or `camera_unavailable` (assets undefined) normalizes to `{ files: [] }` with no error: the user taps "Take photo" and nothing happens, no inline copy. Mirror the gallery check; no test covers the camera errorCode path either [src/features/technicianApp/photoPicker.ts:101-106]
- [x] [Review][Patch] Camera/gallery promises can reject with no handler — `PermissionsAndroid.request` and both launchers are awaited bare; a rejection leaves `onPicked` never fired and an unhandled rejection logged. Wrap each path in try/catch that emits `{ files: [], error: … }` [src/features/technicianApp/photoPicker.ts:88-122]
- [x] [Review][Patch] `mimeFromName` launders a disallowed mime — unknown extension (webp/gif/none) defaults to `image/jpeg`, so an asset with a blank `type` sails past `validateAsset` and is PUT with a JPEG Content-Type; the backend 422s at presign and the tile offers Retry that deterministically fails. Guess only known extensions, else return a non-allowed mime so validation rejects [src/features/technicianApp/photoPicker.ts:153-165]
- [x] [Review][Patch] No test drives the screen's confirm → silent-refetch chain (AC 6) — `onPhotosConfirmed` is referenced by no test; dropping it (or `onConfirmed` in TechJobDetailContent) leaves every suite green while the just-uploaded photo vanishes until pull-to-refresh. Also unasserted: a terminal job with photos renders them read-only (`readOnly={isTerminal}`). Add both cases to `__tests__/tech-job-detail-screen.test.tsx` [src/features/technicianApp/TechJobDetailScreen.tsx:292]
- [x] [Review][Patch] `confirmOnly` (AC 7's Epic-4 seam) has zero test coverage — exported from the model, re-exported from the hook, only ever mocked away. Add tests: done mapping, 409 → `limit`, other → `failed` [src/features/technicianApp/attachmentUploadModel.ts:141-157]
- [x] [Review][Patch] No timeout/abort on the file read or the PUT — a hung R2 request leaves the tile on "Uploading" forever with no retry affordance; wrap both fetches in an AbortController deadline (e.g. 60 s) [src/utils/r2Upload.ts:24-42]
- [x] [Review][Patch] A missing/non-ISO `expiresAt` (Date → NaN) silently bypasses the expiry pre-check — `NaN` compares false, so the bytes are PUT into a possibly-dead URL; guard with `Number.isFinite` [src/features/technicianApp/attachmentUploadModel.ts:103-107]
- [x] [Review][Patch] The `sizeBytes ≥ 1` contract floor is not guarded client-side — a 0-byte blob reaches confirm and 400s as a generic failed tile; fail the attempt instead when the measured size is 0 [src/features/technicianApp/attachmentUploadModel.ts:118-127]
- [x] [Review][Patch] Retry is double-tappable — two taps before the re-render both see `phase: 'failed'` via `entriesRef` and run two pipelines for one localId (duplicate photo); guard with an in-flight localId set [src/features/technicianApp/useAttachmentUpload.ts:172-190]
- [x] [Review][Patch] `onConfirmed`/`onLimit` fire after unmount — `patchEntry`/`dropEntry` check `mountedRef` but the callbacks don't; a pipeline completing after the screen closes triggers a wasted refetch on a dead instance. Gate both calls on `mountedRef.current` [src/features/technicianApp/useAttachmentUpload.ts:133-148]
- [x] [Review][Patch] A failed-tile's `ConfirmedTile` placeholder never recovers — `failed` state persists across a refetch that supplies a fresh read URL for the same photo id (key `c:${photo.id}` keeps the component); reset on url change [src/features/technicianApp/components/PhotoSection.tsx:232-252]
- [x] [Review][Patch] The 410 auto-restart re-enters `presigning` carrying the dead attempt's `uploadId`/`sizeBytes` — harmless today, but a trap for the Epic-4 queue that reads `uploadId` off an entry; clear them on the restart emission [src/features/technicianApp/attachmentUploadModel.ts:86]
- [x] [Review][Patch] Failed tile is not dimmed — ui-design-spec §10 prescribes "dimmed image (opacity 0.5) + bottom strip"; the tile renders at full opacity, differing from a live tile only by the strip [src/features/technicianApp/components/PhotoSection.tsx:269-284]
- [x] [Review][Patch] The in-flight local preview has no onError fallback — a temp file deleted mid-upload renders a blank sunken tile behind the scrim; add the same onError → placeholder as the confirmed tile [src/features/technicianApp/components/PhotoSection.tsx:255-266]
- [x] [Review][Patch] Magic numbers and duplicated copy — `5` hardcoded three times in PhotoSection (limit, 'Limit reached (5)', caption) instead of `MAX_PHOTOS`, and `VALIDATION_MESSAGE` duplicated verbatim in photoPicker.ts and PhotoSection.tsx; share the constants [src/features/technicianApp/components/PhotoSection.tsx:29-36]
- [x] [Review][Patch] Dead defensive branch in `InFlightTile` — the `phase === 'done' || 'failed' ? 'uploading'` guard is unreachable (the tiles array already branches on those phases) and silently collapses an unexpected state; narrow `PHASE_WORD`'s key type and drop the guard [src/features/technicianApp/components/PhotoSection.tsx:255-266]
- [x] [Review][Patch] Missing trailing newlines — every new source/test file and `jest.config.js` end without an EOF newline; add them [all new files]
- [x] [Review][Patch] Dev-record accuracy — Completion Notes say "`pod install` has NOT been confirmed as run" while the diff's `ios/Podfile.lock` contains the react-native-image-picker pod (it ran); the AC-1 `selectionLimit` deviation (uses `remaining`, which also subtracts in-flight) and the hook's options-object signature vs AC 7's literal `useAttachmentUpload(jobId, attachmentType)` are undocumented; `ios/FenzitApp/PrivacyInfo.xcprivacy` (+`3B52.1`) is missing from the File List [story record]

#### Deferred

- [x] [Review][Defer] `limitReached` is a one-way latch — set on a 409, never reset even if a later refetch shows room; harmless today (no photo-delete feature exists) — deferred, reconsider when deletion lands [src/features/technicianApp/useAttachmentUpload.ts:141-148]
- [x] [Review][Defer] Each confirmed file fires its own full detail refetch — 4 parallel confirms → up to 4 chained `load(false)` calls; the screen's inflight chaining softens it — deferred, batch/debounce when a real multi-photo device run shows churn [src/features/technicianApp/TechJobDetailScreen.tsx:292]
- [x] [Review][Defer] A just-confirmed photo vanishes from the grid until the silent refetch lands (brief flicker; the limit briefly under-counts in the same window) — inherent to the drop-on-done design, server 409 is the backstop — deferred, revisit if the flicker shows on device [src/features/technicianApp/useAttachmentUpload.ts:133-137]
- [x] [Review][Defer] A presign 422 (disallowed mime — permanent) is offered Retry that deterministically fails — no retryable/permanent distinction in the pipeline — deferred [src/features/technicianApp/attachmentUploadModel.ts:96-99]
- [x] [Review][Defer] Photo tiles carry no accessibility labels (confirmed images, in-flight previews) — same repo-wide a11y-polish family as the 1-2/3-2 deferred items — deferred [src/features/technicianApp/components/PhotoSection.tsx:232-266]

## Dev Notes

- `sizeBytes` sent to confirm = the blob size measured at PUT time (server treats it as informational, BE A2) — never the picker's possibly-absent fileSize.
- Photo count for the limit = CONFIRMED server photos + local in-flight (pessimistic; a server 409 remains the backstop).
- Do not add react-native-fs or blob-util — the fetch-blob path avoids new native deps.
- Epic-4 seam: the hook's `confirming` phase must be enterable directly with `{ uploadId, sizeBytes }` (export `confirmOnly(entry)`) so the queue can replay a confirm without re-PUTting.
- Files: NEW `services/resources/attachments.ts`, `src/utils/r2Upload.ts`, `features/technicianApp/useAttachmentUpload.ts`, `features/technicianApp/components/PhotoSection.tsx`, `features/technicianApp/photoPicker.ts`; MODIFY barrel, `TechJobDetailScreen.tsx`, ios/Info.plist, android/app/src/main/AndroidManifest.xml; tests.
- [Source: api-contracts.md §8–§10; fenzit-be attachments.service.ts (MIME_TO_EXT, PRESIGNED_TTL 900, count-on-confirmed L119–144, 410 path L265–276); deferred A2/A5/CR3.6-1; web check 2026-09-01: react-native-image-picker new-arch support].

## Dev Agent Record

### Agent Model Used

Claude (GLM 5.3 Flash) via bmad-dev-story, 2026-09-05.

### Debug Log References

- Tests run via `bun run test --watchman=false` (watchman is blocked in the sandbox).
- Full suite after wiring: 43 suites / 371 tests, all green; `bunx tsc --noEmit` clean.

### Completion Notes List

- **Installed version:** `react-native-image-picker@8.2.1`. Added to `jest.config.js` `transformIgnorePatterns` — the package ships raw TypeScript at `"main": "src/index.ts"`, so jest must transform it. No RN 0.86 patching needed; autolinking handles both platforms (no manual android settings.gradle / ios podfile entries).
- **Task order deviation:** Task 5 (picker plumbing) was implemented before Task 4 (PhotoSection UI) because PhotoSection depends on `photoPicker`'s `PickOutcome`/`validateAsset`, not the reverse. All tasks complete in the same run.
- **Blob transport (revised after device testing 2026-09-05):** the file's Blob is read via XMLHttpRequest with `responseType: 'blob'` — NOT `fetch(fileUri).blob()`. Device testing showed the fetch-created blob failing the iOS presigned PUT with `TypeError: Network request failed` (known RN blob incompatibility, react-native#22681). The PUT itself stays on `fetch`. See the header of `src/utils/r2Upload.ts`.
- **AC 1 deviation — `selectionLimit`:** the gallery's selection limit is the section's *remaining* slot count (`5 - confirmed - in-flight`), not AC 1's literal `Math.min(5 - photoCount, 5)` — in-flight uploads count pessimistically so a parallel batch can't overshoot the cap. The 5-photo ceiling and the server's 409 backstop are unchanged.
- **AC 7 deviation — hook signature:** the pipeline is exposed as `useAttachmentUpload({ jobId, attachmentType, onConfirmed?, onLimit? })` (an options object), not AC 7's literal `useAttachmentUpload(jobId, attachmentType)` — the callbacks are how the screen routes the silent refetch and the limit state. The reuse-for-signatures contract (Story 3.5) is unchanged: pass `attachmentType: 'signature'`.
- **Model/hook split:** the pipeline logic lives in a pure model file `attachmentUploadModel.ts` (deps injected — `presign`/`put`/`confirm`/`now`/`freshKey` — testable without React or network, mirroring `workflowActionBarModel.ts`); `useAttachmentUpload.ts` is the thin React wrapper that wires the real services in. The story's "hook" requirement is unchanged; the split exists for the repo's testability idiom.
- **`pod install` status:** Info.plist usage strings added; `cd ios && pod install` WAS run — `ios/Podfile.lock` pins `react-native-image-picker (8.2.1)`.
- **Epic-4 seam:** `confirmOnly(jobId, uploadId, sizeBytes, deps)` is exported from `useAttachmentUpload.ts` (re-exported from the model), entering the pipeline directly at the post-PUT/pre-confirm boundary.
- **In-flight counting:** PhotoSection counts only non-`failed` entries toward the limit (`confirmed + inFlightActive >= 5`); a failed tile does not block new photos, and Retry re-adds one.
- **Validation copy:** one shared inline line ("Only JPG, PNG or HEIC up to 10 MB") under the grid for any rejected asset, per spec §15 (no per-file copy in the UI).
- **Read-only terminal jobs:** the Photos card shows confirmed photos with no add tile when the job is completed/cancelled.

### File List

- NEW `src/services/resources/attachments.ts` + `attachments.test.ts` (presign/confirm service)
- NEW `src/utils/r2Upload.ts` + `r2Upload.test.ts` (R2 PUT transport)
- NEW `src/features/technicianApp/attachmentUploadModel.ts` + `.test.ts` (pure upload pipeline)
- NEW `src/features/technicianApp/useAttachmentUpload.ts` + `useAttachmentUpload.test.tsx` (React hook + Epic-4 `confirmOnly`)
- NEW `src/features/technicianApp/photoPicker.ts` + `photoPicker.test.ts` (picker plumbing + `validateAsset`)
- NEW `src/features/technicianApp/components/PhotoSection.tsx` + `PhotoSection.test.tsx` (Photos card UI)
- MODIFIED `src/services/resources/index.ts`, `src/utils/index.ts` (barrels)
- MODIFIED `src/features/technicianApp/components/TechJobDetailContent.tsx` (AttachmentGrid → PhotoSection in the Photos card, `onPhotosConfirmed` prop)
- MODIFIED `src/features/technicianApp/TechJobDetailScreen.tsx` (threads the silent refetch into `onPhotosConfirmed`)
- MODIFIED `ios/FenzitApp/Info.plist` (camera + photo-library usage strings)
- MODIFIED `ios/FenzitApp/PrivacyInfo.xcprivacy` (camera + photo-library `NSPrivacyAccessedAPICategory` entries, incl. required-reason `3B52.1`)
- MODIFIED `ios/Podfile.lock` (react-native-image-picker 8.2.1 pod, via `pod install`)
- MODIFIED `android/app/src/main/AndroidManifest.xml` (`android.permission.CAMERA`)
- MODIFIED `package.json`, `bun.lock` (`react-native-image-picker@8.2.1`), `jest.config.js` (transformIgnorePatterns)

## Change Log

- 2026-09-05 — Story 3.4 implemented end to end (Tasks 0–6): presign → R2 PUT → confirm pipeline (pure model + hook), photo/gallery picker with client-side validation, PhotoSection tile grid wired into the job detail Photos card, platform permissions configured. 34 new tests; full suite 371/371 green; `tsc --noEmit` clean. Status → review.
- 2026-09-05 — Code-review follow-up: all 18 review patches applied. Device-run Decision 1 closed (XHR blob read fixes the iOS PUT; VPN caveat recorded); Decision 2 closed as option (a) (10 MB cap enforced post-read/pre-PUT via injected `maxBytes`). Notable: the pipeline now folds `uploadId`/`sizeBytes` into the entry itself (a latent gap the P12 test exposed), the expiry pre-check fails safe on NaN `expiresAt`, a 0-byte PUT fails pre-confirm, both transport legs carry a 60 s deadline, retry is double-tap-guarded, callbacks are unmount-gated, and PhotoSection shares `MAX_PHOTOS`/`VALIDATION_MESSAGE` with the picker. `DEV_API_HOST` temporarily hardcoded to `192.168.1.208` (user request — revert before shipping).
- 2026-09-05 — Second review pass (3-way: FE pipeline · FE picker/UI · FE↔BE contract cross-check). FE fixes: read-only renders NO add tile (was a disabled "Limit reached (5)" tile on every terminal job — wrong copy; `chunkRows` now drops null tiles so the hidden tile can't stretch its row-mates); API failures surface `ApiError.message` instead of "[object Object]" (`errorMessage` helper — the client rejects with a plain object, not an Error); presign 200 bodies missing `presignedPutUrl`/`uploadId` fail before the PUT (bytes were being uploaded then 404ing at confirm); `image/heif` picker-reported type folded to `image/heic` (the extension path already did); read-only test strengthened + 4 new tests. BE-side findings deferred (see `deferred-work.md`): parallel-confirm photo-limit race, confirm's missing idempotency interceptor, orphaned R2 objects post-410, no object/size verification at confirm. FE comment corrected: confirm is NOT idempotency-replayed on the backend (header ignored); stale presign/confirm section in `fenzit-be/docs/api-contracts.md` rewritten to match the implementation. Full suite 402/402 green; `tsc --noEmit` clean.
