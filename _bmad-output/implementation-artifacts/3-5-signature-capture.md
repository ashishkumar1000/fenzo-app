---
baseline_commit: af01f7a4e091ff79ceae3830723cfb33d8dbce6e
---

# Story 3.5: Signature Capture

Status: done

> **Revised 2026-09-05** — requirement change: signature capture is now **optional per job**
> (`requireCompletionSignature`, decided by the owner; BE Story 3-8 adds the flag). When not
> required, the signature step is **fully hidden** — no voluntary capture. The original
> always-required ACs below were rewritten, not patched.

## Story

As a technician,
I want to capture the customer's signature on my phone when the job requires it,
so that proof of acceptance exists before I mark the job complete.

## API Contract (api-contracts.md §8–§10 + §7)

Signature = same three-phase upload with `attachmentType: 'signature'`, `mimeType: 'image/png'`.
One per job; re-confirm REPLACES the old one server-side (`conflict_resolved` logged). Old
uploadIds of a replaced signature 404 on re-confirm (CR3.6-4) — never store uploadIds. After a
confirmed signature, the step advance `POST /jobs/:id/workflow { step: 'signature_captured' }`
is a separate call (does not auto-advance; only photos do).

**New with BE Story 3-8 (ships first):** every job payload (`ApiJob`, detail, list) carries
`requireCompletionSignature: boolean`. Step ordering is the **effective-chain rule** — from the
current step, the next *required* step is the only legal target; when neither photo nor
signature is required, `completed` is reachable directly from `in_progress`. A 422
`INVALID_WORKFLOW_STEP` body carries the server's `currentStep` for reconcile.

## UI Design (ui-design-spec.md §11 — customer-facing screen, extra polish)

Back header "Customer signature". Column padding s4 gap s4: instruction body "Please ask the
customer to sign below."; pad card = Card chrome (white, borderSubtle, radius.lg) flex-1
min-height 320, canvas clipped to the radius, with a 1px dashed baseline at ~70% height +
caption textDisabled "Sign here" beneath it — both hide on first stroke; error line bodySm
danger under the pad when upload fails (drawing preserved); footer row gap s3 = Button
secondary md flex-1 "Clear" + Button primary md flex-1 "Save signature" (disabled until stroke,
loading through upload+advance). Offline helper caption under the footer: "Signature upload
needs internet." Pen colors.textStrong width ~2.5 on white. No emoji, no decorative flourish.

**Optionality (spec §9 + §8):** on jobs with `requireCompletionSignature === false` the
signature step does not exist in the UI at all — no stepper row (unlike photos, which render
as "skipped"), no Capture-signature action-bar button, no signature card. The signature
screen is reachable only from the action bar's "Capture signature" button, which only appears
when the flag is true.

## Acceptance Criteria

1. **Given** a job with `requireCompletionSignature: true` and the primary action "Capture
   signature" (Story 3.3 AC 4 — flip its `useWorkflowAdvance.ts:74-76` TODO to navigate),
   **then** `Signature { jobId }` opens on TechnicianRootNavigator: full-screen pad (portrait,
   wide pad card on `colors.surfacePage`), pen `colors.textStrong`, Clear + Save buttons
   ≥ 44px, back header.
2. **Given** a job with `requireCompletionSignature: false`, **then** the signature step is
   absent everywhere: no stepper row, the action bar advances straight to "Mark complete"
   (from `in_progress` when photos aren't required either, or after photos when they are),
   and the Customer-signature card (`TechJobDetailContent.tsx:171-189`) is not rendered.
   Voluntary capture is NOT offered (decision 2026-09-05).
3. **Given** an empty pad, **then** Save is disabled (track `hasStroke` via the pad's
   onBegin/onEnd or onEmpty callbacks).
4. **Given** Save with strokes, **then** the drawn image exports to PNG and uploads via
   `useAttachmentUpload({ jobId, attachmentType: 'signature' })` (presign → PUT → confirm);
   on confirm success the screen calls `jobService.advanceWorkflow(jobId,
   'signature_captured', generateIdempotencyKey())`, then pops back; TechJobDetail refetches
   (focus effect or onSaved callback) showing the signature + advanced stepper. A 422 on the
   advance (step already recorded — e.g. offline race) reconciles silently per 3.3 AC 5 and
   still pops.
5. **Given** upload failure at any phase, **then** the pad stays open, the DRAWING IS
   PRESERVED, and a Retry re-runs from presign with fresh keys (3.4 AC 4 semantics); a
   persistent inline error line shows `ApiError.message` via the shared `errorMessage` helper
   (3.4 second review — the client rejects with a plain object, not an Error).
6. **Given** an existing signature on a non-terminal job that requires signature, **then** the
   signature card shows the image with a "Re-capture" affordance opening the same screen;
   success replaces the shown image (server last-write-wins). Terminal jobs and flag-off jobs
   show no signature card.
7. **Given** no connectivity (Epic 4 will formalize), **then** THIS story disables Save with
   helper text "Signature upload needs internet" when a quick reachability probe fails
   (interim: attempt → network-class ApiError keeps pad open with that copy; Epic 4 swaps in
   the NetInfo check — leave `// EPIC4: NetInfo gate` marker).
8. **Given** the `requireCompletionSignature` field is added (required, `boolean`) to `ApiJob`,
   **then** all stale fixtures compile: `workflowActionBarModel.test.ts:30`,
   `WorkflowStepper.test.tsx:26`, `jobs.test.ts:32`, `editJobModel.test.ts:32` (BE always
   sends the field; prefer updating fixtures over an optional field that lies about the wire).

## Tasks / Subtasks

- [x] **Task 0 — Library decision + install**: PRIMARY `bun add react-native-signature-canvas
      react-native-webview` + pod install (signature-canvas renders in a WebView; webview
      supports new arch). Smoke-test on RN 0.86 FIRST (render pad, draw, read base64) — if the
      webview route fails on 0.86, FALLBACK `bun add react-native-signature-ink` (Fabric-native,
      no webview). Record the decision, versions, and evidence in Dev Agent Record. Add the
      package to `jest.config.js` `transformIgnorePatterns` if it ships raw TS (3.4 precedent
      with react-native-image-picker). API notes for the primary: `<SignatureScreen ref
      onOK={(base64DataUri) => ...} onBegin onEnd onEmpty webStyle={...} penColor
      backgroundColor />`, imperative `ref.readSignature()`, `ref.clearSignature()`.
- [x] **Task 1 — Data-URI → upload input** (`src/utils/signatureExport.ts`, new): the pad
      returns `data:image/png;base64,<...>`. SHIPPED transport (third path — the XHR blob
      read and the `{uri}` PUT-body fallback were both rejected): `r2Upload` intercepts
      data URIs and decodes the base64 in JS (`src/utils/base64.ts` → `Uint8Array`), then
      PUTs the bytes as the fetch body. RN's XHR cannot read data: URLs as blobs (0-byte
      PUT) and `fetch(dataUri).blob()` is forbidden; both are documented as never-do in
      `signatureExport.ts` / `r2Upload.ts`. Malformed input is rejected explicitly:
      non-base64 data URIs throw in `r2Upload`, truncated base64 (4k+1 length) throws in
      `base64.ts`. On-device verification of the decode+PUT path is pending (smoke test).
      Provide `export function signatureFilename(jobId: string) { return
      \`signature-${jobId}.png\`; }`.
- [x] **Task 2 — Types + model** : add `requireCompletionSignature: boolean` to `ApiJob`
      (`src/services/resources/jobs.ts`, sibling of `:149`) — flows into `JobDetail` and the
      list/detail/sync-typed surfaces automatically (`apiJobOf` spreads rows as-is;
      `useTechnicianJobs` needs no change). Update `fenzo-app
      _bmad-output/planning-artifacts/api-contracts.md` §2 (`ApiJob`) and §1/§7 (effective-chain
      step rule) in this story.
- [x] **Task 3 — Stepper** (`src/features/technicianApp/stepperModel.ts`): widen `StepperJob`
      (:38) with the new flag. Effective-chain rendering: when
      `!job.requireCompletionSignature`, DROP the `signature_captured` row entirely (do not
      render "skipped"); the photo rows/logic at :64/:73-78 are unchanged (photos stay
      "skipped" when not required — deliberate asymmetry, see Dev Notes). `next` must land on
      `completed` when signature is not required (from `in_progress` when photos aren't
      required either; from `photos_uploaded` when they are). Handle the dynamic-flag edge:
      `current_step === 'signature_captured'` while the flag is off → render the step done and
      make `completed` next. Progress denominator: `TechJobDetailContent.tsx:71-72,90` counts
      `STEP_ORDER.length` — switch it to the returned row count so "X of N" stays correct.
- [x] **Task 4 — Action bar** (`workflowActionBarModel.ts`): no new branch needed if Task 3
      lands the `next` correctly — the bar already renders `ADVANCE_LABELS[next.step]`
      (:64-65), so `next === 'completed'` yields "Mark complete". Update the pinned test
      `workflowActionBarModel.test.ts:68-71` (in_progress, no photo → today asserts Capture
      signature): keep that case for signature-required jobs and add the flag-off →
      "Mark complete" case.
- [x] **Task 5 — Detail card gate** (`TechJobDetailContent.tsx:171-189`): render the
      Customer-signature card only when `detail.requireCompletionSignature` is true (tile when
      a signature exists, dashed placeholder otherwise — placeholder copy per spec §8). When
      false, render nothing (compare: the Photos card keeps its current
      render-even-when-not-required behaviour — untouched). Keep `Re-capture` affordance
      per AC 6 (technician side; the owner-side `AttachmentGrid` signature row stays
      display-only).
- [x] **Task 6 — Signature screen** (`features/technicianApp/SignatureScreen.tsx`, new;
      register `Signature: { jobId }` on TechnicianRootNavigator — param already typed at
      `navigation/types.ts:57`): layout per UI Design above; orchestration:
      ```ts
      const onSave = () => padRef.current?.readSignature();           // → onOK
      const onOK = async (dataUri: string) => {
        setBusy(true); setError(null);
        try {
          await uploadSignature(dataUri);                             // useAttachmentUpload single-entry path
          try { await jobService.advanceWorkflow(jobId, 'signature_captured', generateIdempotencyKey()); }
          catch (e) { if (workflowCurrentStep(e as ApiError) === undefined) throw e; /* 422 already-recorded → fine */ }
          navigation.goBack();
        } catch (e) { setError(errorMessage(e)); }                    // drawing preserved — do NOT clear
        finally { setBusy(false); }
      };
      ```
      Guard: a hard advance failure (network) after a successful upload must NOT re-upload on
      retry — track `confirmedThisSession` and retry only the advance.
- [x] **Task 7 — Hook generalization check** (`useAttachmentUpload`): the 3.4 hook ships an
      options object (`useAttachmentUpload({ jobId, attachmentType, onConfirmed?, onLimit? })`)
      with parallel entries. Confirm a single-file convenience exists (or add
      `uploadOne({ fileUri, filename, mimeType })` returning the ConfirmResponse) — 3.5 needs
      exactly one file per save.
- [x] **Task 8 — Advance wiring** (`useWorkflowAdvance.ts:74-76`): replace the TODO — the
      `signature_captured` action navigates to `Signature` instead of direct POST (direct POST
      remains the 422-reconcile fallback path used by Epic 4 replay).
- [x] **Task 9 — Tests**: Save disabled until stroke; onOK failure preserves state and shows
      error; 422-on-advance still navigates back; confirmedThisSession retry skips re-upload;
      filename helper; stepper flag-off rows (hidden signature, completed next, denominator);
      action-bar flag-off cases; card gate renders/hides; display picks newest signature;
      fixtures per AC 8. Run via `bun run test --watchman=false` (watchman is sandbox-blocked).

## Dev Notes

- Sequence is capture → upload → advance → back. The advance is best-effort-with-reconcile;
  implement the `confirmedThisSession` guard (Task 6).
- **Deliberate asymmetry — photos "skipped" vs signature hidden.** Photos keep the existing
  skipped-row rendering because photo upload stays available on every job (3.4 ships it
  unconditionally). Signature is hidden entirely per the 2026-09-05 requirement decision.
  Do not "unify" them.
- `StepperJob` is a Pick of `JobDetail` — widening it forces the test fixtures (AC 8); that is
  the point (the field is required on the wire).
- WebView note: keep the pad's `webStyle` minimal (background transparent, pen width ~2.5) —
  the RN chrome around the webview carries the design tokens.
- Files: NEW `features/technicianApp/SignatureScreen.tsx`, `src/utils/signatureExport.ts`;
  MODIFY `navigation/TechnicianRootNavigator.tsx` (register),
  `services/resources/jobs.ts` (ApiJob field), `features/technicianApp/useAttachmentUpload.ts`
  (uploadOne if missing), `useWorkflowAdvance.ts` (TODO flip), `stepperModel.ts`,
  `workflowActionBarModel.ts`, `components/TechJobDetailContent.tsx` (gate + denominator);
  package.json/ios pods/jest.config.js; tests.
- BE dependency: `requireCompletionSignature` must exist on job payloads (fenzit-be 3-8
  merges/deploys first). Until it ships, this story's type addition is the only safe change —
  sequence the rest after the BE merge.
- [Source: api-contracts.md §7–§10 + fenzit-be 3-8 story; fenzit-be workflow.service.ts
  effective-chain rule; web check 2026-09-01: signature-canvas requires react-native-webview;
  signature-ink = Fabric-native fallback; 3-4 Dev Agent Record: XHR blob transport,
  errorMessage helper, options-object hook].

## Dev Agent Record

### Agent Model Used

- Claude Code (GLM 5.3 flash) — BMAD dev-story workflow, 2026-09-05.

### Debug Log References

- `bun run test --watchman=false` — 47 suites, 450 tests, all passing after the
  review patches (was 46/432 at implementation; watchman is sandbox-blocked;
  `--watchman=false` per 3.4 precedent).
- `bunx tsc --noEmit` — clean after review patches too (the 422 reconcile in
  SignatureScreen narrows `workflowCurrentStep`'s `string | null | undefined`
  and casts to `WorkflowStep` only after an `includes` guard).
- `bunx tsc --noEmit` — clean after fixture fixes (`__tests__/stepperModel.test.ts`
  default `requireCompletionSignature: true`; PhotoSection.test hook-return stub
  gained the now-required `uploadOne`).
- Sandbox blocked `bun add` (tempdir write) — user ran the install; pods were
  installed in the same step.
- SignatureScreen 422 test initially failed with a wrong fixture shape — the
  real wire contract is `code: 'INVALID_WORKFLOW_STEP'` + `details.currentStep`
  (apiError.ts), not a made-up code; fixture corrected to the real shape.
- TechJobDetailContent "newest signature" test: `findAllByProps` does not match
  object props (`source: {uri}`) in this RN jest setup — replaced with a
  predicate `findAll`.

### Completion Notes List

- Task 0 — PRIMARY route chosen: `react-native-signature-canvas@5.1.1` +
  `react-native-webview@14.0.1` (pod install completed, 87 pods; webview added
  to jest `transformIgnorePatterns` — signature-canvas ships raw ESM at
  "main"). Library API verified against the installed source (props: onOK/
  onBegin/onEmpty/penColor/webStyle; ref: readSignature/clearSignature).
  **On-device RN 0.86 smoke test (draw → readSignature → data-URI XHR PUT) is
  still pending** — needs a simulator/device run. If the data-URI blob read in
  `r2Upload` fails on device, the documented fallback is sending the data URI
  as the PUT body over native networking (3.4 Task 2 fallback); a follow-up
  should verify before release.
- Task 1 — `src/utils/signatureExport.ts`: `SIGNATURE_MIME_TYPE` +
  `signatureFilename(jobId)` → `signature-<jobId>.png`. Shipped transport is a THIRD
  path (neither XHR blob-read nor the `{uri}` fallback): `r2Upload` intercepts data
  URIs and JS-decodes the base64 (`src/utils/base64.ts` → `Uint8Array`) as the fetch
  PUT body — RN's XHR reads data: URIs as 0-byte blobs, so neither XHR nor
  `fetch(dataUri).blob()` can work. Both broken paths are documented as never-do;
  malformed base64/data URIs are rejected explicitly. Not device-verified yet —
  the smoke test is pending (see Task 0 note).
- Task 2 — `ApiJob.requireCompletionSignature` already existed (story 1-6) and
  api-contracts §1/§2 already documented the flag + effective chain — no code
  or doc change needed; AC 8 fixtures were already carrying the field.
- Task 3 — `stepperModel`: `StepperJob` widened; `buildStepper` filters the
  signature row when the flag is off (row still appears when the server says
  `signature_captured` on a dynamic flag flip); `isEffectiveNext` walks the
  effective chain. Deliberate asymmetry with photos' "skipped" row kept.
- Task 4 — no model change; tests pin flag-off bar behavior.
- Task 5 — signature card gated on `requireCompletionSignature && !isTerminal`;
  captured tile offers Re-capture when the screen wires `onRecaptureSignature`.
- Task 6 — `SignatureScreen`: Save disabled until a stroke (onBegin/onEmpty);
  Save = readSignature → onOK → `uploadOne` → advance → pop. `confirmedThisSession`
  latches after a successful upload so a retry re-runs ONLY the advance; a 422
  with `workflowCurrentStep` defined reconciles silently and pops; failures
  keep the pad + drawing and surface `errorMessage`. The library's own footer
  is hidden via webStyle; "Sign here" baseline at 70% until first stroke.
- Task 7 — `uploadOne({fileUri, filename, mimeType})` added to
  `useAttachmentUpload` (same pipeline, fresh keys, 410 auto-restart; no tile
  lifecycle). `errorMessage` re-exported for the screen.
- Task 8 — `useWorkflowAdvance` now routes `signature_captured` to an injected
  `onCaptureSignature` (navigate) instead of POSTing; TechJobDetailScreen wires
  it, plus `onRecaptureSignature`, and a skip-first `useFocusEffect` silent
  refetch so returning from Signature shows the new attachment + advanced
  stepper (AC 4).
- Task 9 — display picks the NEWEST signature (attachments are oldest-first;
  `filter().slice(-1)` replaces `find()`); jest.setup gains a global fake pad
  mock (the real one needs the WebView TurboModule); screen-level test suite
  extended (focus refetch, terminal-no-card per revised AC 6).
- `// EPIC4: NetInfo gate` marker left in SignatureScreen — offline copy lands
  with Epic 4's reachability check; for now a network-class failure keeps the
  pad open with the error line.

### File List

- `package.json`, `bun.lock`, `ios/Podfile.lock` — deps (signature-canvas, webview) + pods
- `jest.config.js` — transformIgnorePatterns allowlist
- `jest.setup.js` — global fake signature-pad mock
- `src/utils/signatureExport.ts` + `signatureExport.test.ts` — new
- `src/utils/base64.ts` + `base64.test.ts` — new (JS base64 decoder used by the data-URI PUT body)
- `src/utils/r2Upload.ts` + `r2Upload.test.ts` — data-URI branch (base64 → Uint8Array fetch body)
- `src/features/technicianApp/stepperModel.ts` — effective chain + row filter
- `src/features/technicianApp/workflowActionBarModel.test.ts` — flag-off cases
- `src/features/technicianApp/components/WorkflowStepper.test.tsx` — flag-off/dynamic cases
- `src/features/technicianApp/components/TechJobDetailContent.tsx` — card gate + newest signature
- `src/features/technicianApp/components/TechJobDetailContent.test.tsx` — new
- `src/features/technicianApp/components/PhotoSection.test.tsx` — hook stub gains uploadOne
- `src/features/technicianApp/attachmentUploadModel.ts` — `errorMessage` exported
- `src/features/technicianApp/useAttachmentUpload.ts` — `uploadOne` + `captureError`
- `src/features/technicianApp/useAttachmentUpload.test.tsx` — uploadOne suite
- `src/features/technicianApp/SignatureScreen.tsx` + `.test.tsx` — new
- `src/features/technicianApp/useWorkflowAdvance.ts` — signature step navigates
- `src/features/technicianApp/TechJobDetailScreen.tsx` — capture/recapture wiring + focus refetch
- `src/navigation/TechnicianRootNavigator.tsx` — Signature screen registered
- `__tests__/stepperModel.test.ts`, `__tests__/tech-job-detail-screen.test.tsx` — fixtures + revised terminal-card test + focus-refetch test

## Change Log

- 2026-09-05 — Story implemented (all tasks 0-9): optional-signature stepper/bar/card
  gating, SignatureScreen (capture → upload → advance → pop, confirmedThisSession retry
  guard, 422 reconcile), `uploadOne` on the upload hook, advance wiring + focus refetch,
  newest-signature display. Status → review. On-device pad smoke test pending (see
  Completion Notes).
- 2026-09-05 — Story revised for optional signature (requirement decision 2026-09-05: owner
  decides via `requireCompletionSignature`; step fully hidden when not required; no voluntary
  capture; BE Story 3-8 ships first). Original always-required ACs replaced; Tasks 2-5, 8
  added; original Tasks renumbered.
- 2026-09-05 — BMAD code review (4 layers): 15 patches applied — Clear resets the
  confirmedThisSession latch and the stroke state (real library fires onClear, never
  onEmpty); offline copy for network-class failures; 422 reconcile only accepts
  currentStep >= signature_captured; busyRef reentrancy + mountedRef unmount guards;
  uploadOne confirm-checked; base64/data-URI input validation; onError disables Save;
  stale TODO removed; trailing newlines; story record corrected (Task 1 transport, File
  List); 7 new tests. 4 findings deferred (pre-existing, recorded in deferred-work.md).
  Decision: commit with the on-device smoke test still pending.

## Review Findings

### Review Findings — BMAD code review 2026-09-05 (4 layers)

- [x] [Review][Decision] On-device smoke test vs commit ordering — the data-URI PUT transport
  (base64 → Uint8Array fetch body) and the pad library are verified only through stubbed fetch
  in jest; the story's own record says the RN 0.86 smoke test (draw → readSignature → presign →
  PUT → confirm) is still pending. Decide: apply review patches and commit with the smoke test
  still pending, or hold the commit until the device run lands.
  **Resolved 2026-09-05 (user): apply patches and commit; the smoke test stays pending and
  remains documented here and in the Completion Notes — run it before release.**
- [x] [Review][Patch] Clear leaves Save enabled on an empty pad — the real library never fires
  `onEmpty` after `clearSignature()` (verified in node_modules source: CLEAR posts to the
  `onClear` prop; EMPTY only fires from readSignature on an empty pad), so `hasStroke` stays
  true and AC 3 breaks on-device; the jest mocks bake the wrong assumption in
  [src/features/technicianApp/SignatureScreen.tsx:120]
- [x] [Review][Patch] Latched advance + Clear/redraw silently discards the new drawing — after
  upload confirms but the advance fails hard, Clear + redraw + Save skips the upload entirely
  (latch never resets) and records the OLD signature; Clear alone also bricks the retry
  (Save disabled with no stroke to re-press). Reset `confirmedThisSession` on Clear
  [src/features/technicianApp/SignatureScreen.tsx:86]
- [x] [Review][Patch] AC 7 offline copy never rendered — the catch shows raw `errorMessage(e)`,
  never the "Signature upload needs internet." copy the AC and header comment promise for
  network-class failures [src/features/technicianApp/SignatureScreen.tsx:108]
- [x] [Review][Patch] signatureExport.ts module header describes the abandoned XHR data-URI
  transport — contradicts the shipped `r2Upload` path (JS base64 decode → Uint8Array fetch
  body) and would steer a future agent back to the broken 0-byte blob read
  [src/utils/signatureExport.ts:8]
- [x] [Review][Patch] Contradictory device-verification evidence — `r2Upload.ts`/`r2Upload.test.ts`
  claim "Android-verified 2026-09-05" for the 0-byte XHR data-URI read while the story record
  says the on-device smoke test is pending; story Task 1 text still describes the XHR spike and
  Completion Notes record the wrong outcome; File List omits `src/utils/base64.ts` and the
  `r2Upload` changes [src/utils/r2Upload.ts:33]
- [x] [Review][Patch] 422 reconcile accepts any `details.currentStep` as success — a 422 whose
  server currentStep is BEFORE `signature_captured` (real rejection, not an already-recorded
  race) is treated as success and the screen pops with the step never recorded; reconcile only
  when currentStep === 'signature_captured' (or later) [src/features/technicianApp/SignatureScreen.tsx:100]
- [x] [Review][Patch] Late goBack after leaving mid-upload — `onOK` continues after unmount and
  its final `navigation.goBack()` pops the screen underneath (detail screen); guard with a
  mountedRef (also stops setState-after-unmount) [src/features/technicianApp/SignatureScreen.tsx:106]
- [x] [Review][Patch] Reentrancy window in onOK — busy is set only after the native
  readSignature roundtrip, so a double-tap inside that window runs two concurrent pipelines
  (forked uploads); Button's loading guard only covers the rendered-busy state. Add a busyRef
  early-return [src/features/technicianApp/SignatureScreen.tsx:80]
- [x] [Review][Patch] uploadOne returns `confirmed as ConfirmResponse` unchecked — a branch
  reporting done without a resolved confirm hands undefined to the screen and the advance
  proceeds without a confirmed attachment; replace the cast with `if (!confirmed) throw`
  [src/features/technicianApp/useAttachmentUpload.ts:229]
- [x] [Review][Patch] Base64/data-URI input validation — malformed base64 with length % 4 === 1
  silently truncates (partial PNG uploaded and confirmed); a non-base64 data URI falls through
  `dataUriBytes` to the known-broken XHR read (0-byte PUT). Reject both explicitly
  [src/utils/base64.ts:29] [src/utils/r2Upload.ts:56]
- [x] [Review][Patch] Capture-signature navigation untested — no test drives
  `advance('signature_captured')` through the screen; a regression would POST the step with no
  signature ever uploaded. Assert pressing the bar button navigates to `Signature { jobId }`
  and does not POST [__tests__/tech-job-detail-screen.test.tsx:436]
- [x] [Review][Patch] Progress denominator unpinned for flag-off jobs — the only count
  assertion ("0 of 6") uses a signature-on fixture, so reverting `steps.length` to
  `STEP_ORDER.length` passes all tests; add a flag-off "N of 5" assertion
  [src/features/technicianApp/components/TechJobDetailContent.tsx:106]
- [x] [Review][Patch] Pad onError leaves Save enabled and the branch is untested — if the pad
  fails after strokes, `hasStroke` stays true; reset it in onError and pin the error branch
  [src/features/technicianApp/SignatureScreen.tsx:159]
- [x] [Review][Patch] Stale TODO below the implemented branch — the TODO(3.5) comment describes
  the navigation that the branch directly above it already implements
  [src/features/technicianApp/useWorkflowAdvance.ts:88]
- [x] [Review][Patch] Missing trailing newlines — new files end without a final newline
  (signatureExport.ts/.test, base64.ts/.test, SignatureScreen.tsx/.test,
  TechJobContent.test.tsx, TechnicianRootNavigator.tsx, story md files) — same defect class
  fixed in the 1-6 review [src/utils/signatureExport.ts]
- [x] [Review][Defer] Owner-side signature display picks the OLDEST attachment
  [src/features/jobDetail/components/AttachmentGrid.tsx:86] — after a technician re-capture the
  owner keeps seeing the first (oldest) signature image; parity fix is the same
  `filter().slice(-1)` the technician side got in this story — deferred, pre-existing (shipped
  with 1-6, outside this diff)
- [x] [Review][Defer] Owner timeline still counts the fixed 6-step chain — owner job detail
  renders "Step N of 6" from `STEP_ORDER.length`, so a signature-off job shows 6 to the owner
  and 5 on the technician rail — deferred, pre-existing (owner side, untouched in this diff)
- [x] [Review][Defer] sprint-status 1-6 done-line lacks a commit hash unlike sibling done
  stories — deferred, pre-existing (committed in c7a9e67, doc nit)
- [x] [Review][Defer] Relative imports in new files (SignatureScreen, signatureExport, base64)
  follow each file's local style against the CLAUDE.md alias rule — deferred, pre-existing
  pattern family (already deferred from 1-6 and 2-1 reviews)
