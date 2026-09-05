---
baseline_commit: af01f7a4e091ff79ceae3830723cfb33d8dbce6e
---

# Story 3.5: Signature Capture

Status: ready-for-dev

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

- [ ] **Task 0 — Library decision + install**: PRIMARY `bun add react-native-signature-canvas
      react-native-webview` + pod install (signature-canvas renders in a WebView; webview
      supports new arch). Smoke-test on RN 0.86 FIRST (render pad, draw, read base64) — if the
      webview route fails on 0.86, FALLBACK `bun add react-native-signature-ink` (Fabric-native,
      no webview). Record the decision, versions, and evidence in Dev Agent Record. Add the
      package to `jest.config.js` `transformIgnorePatterns` if it ships raw TS (3.4 precedent
      with react-native-image-picker). API notes for the primary: `<SignatureScreen ref
      onOK={(base64DataUri) => ...} onBegin onEnd onEmpty webStyle={...} penColor
      backgroundColor />`, imperative `ref.readSignature()`, `ref.clearSignature()`.
- [ ] **Task 1 — Data-URI → upload input** (`src/utils/signatureExport.ts`, new): the pad
      returns `data:image/png;base64,<...>`. The shipped R2 transport reads the file's Blob via
      XMLHttpRequest with `responseType: 'blob'` (`src/utils/r2Upload.ts` — fetch-based
      `.blob()` was replaced after the 3.4 device run; do NOT reintroduce
      `fetch(dataUri).blob()`). Spike whether XHR blob-read works for a data URI on-device
      (it should — XHR supports data: URLs); if not, fall back to the `{ uri: dataUri }`
      PUT-body native-networking form (3.4 Task 2 fallback). Record the outcome.
      Provide `export function signatureFilename(jobId: string) { return
      \`signature-${jobId}.png\`; }`.
- [ ] **Task 2 — Types + model** : add `requireCompletionSignature: boolean` to `ApiJob`
      (`src/services/resources/jobs.ts`, sibling of `:149`) — flows into `JobDetail` and the
      list/detail/sync-typed surfaces automatically (`apiJobOf` spreads rows as-is;
      `useTechnicianJobs` needs no change). Update `fenzo-app
      _bmad-output/planning-artifacts/api-contracts.md` §2 (`ApiJob`) and §1/§7 (effective-chain
      step rule) in this story.
- [ ] **Task 3 — Stepper** (`src/features/technicianApp/stepperModel.ts`): widen `StepperJob`
      (:38) with the new flag. Effective-chain rendering: when
      `!job.requireCompletionSignature`, DROP the `signature_captured` row entirely (do not
      render "skipped"); the photo rows/logic at :64/:73-78 are unchanged (photos stay
      "skipped" when not required — deliberate asymmetry, see Dev Notes). `next` must land on
      `completed` when signature is not required (from `in_progress` when photos aren't
      required either; from `photos_uploaded` when they are). Handle the dynamic-flag edge:
      `current_step === 'signature_captured'` while the flag is off → render the step done and
      make `completed` next. Progress denominator: `TechJobDetailContent.tsx:71-72,90` counts
      `STEP_ORDER.length` — switch it to the returned row count so "X of N" stays correct.
- [ ] **Task 4 — Action bar** (`workflowActionBarModel.ts`): no new branch needed if Task 3
      lands the `next` correctly — the bar already renders `ADVANCE_LABELS[next.step]`
      (:64-65), so `next === 'completed'` yields "Mark complete". Update the pinned test
      `workflowActionBarModel.test.ts:68-71` (in_progress, no photo → today asserts Capture
      signature): keep that case for signature-required jobs and add the flag-off →
      "Mark complete" case.
- [ ] **Task 5 — Detail card gate** (`TechJobDetailContent.tsx:171-189`): render the
      Customer-signature card only when `detail.requireCompletionSignature` is true (tile when
      a signature exists, dashed placeholder otherwise — placeholder copy per spec §8). When
      false, render nothing (compare: the Photos card keeps its current
      render-even-when-not-required behaviour — untouched). Keep `Re-capture` affordance
      per AC 6 (technician side; the owner-side `AttachmentGrid` signature row stays
      display-only).
- [ ] **Task 6 — Signature screen** (`features/technicianApp/SignatureScreen.tsx`, new;
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
- [ ] **Task 7 — Hook generalization check** (`useAttachmentUpload`): the 3.4 hook ships an
      options object (`useAttachmentUpload({ jobId, attachmentType, onConfirmed?, onLimit? })`)
      with parallel entries. Confirm a single-file convenience exists (or add
      `uploadOne({ fileUri, filename, mimeType })` returning the ConfirmResponse) — 3.5 needs
      exactly one file per save.
- [ ] **Task 8 — Advance wiring** (`useWorkflowAdvance.ts:74-76`): replace the TODO — the
      `signature_captured` action navigates to `Signature` instead of direct POST (direct POST
      remains the 422-reconcile fallback path used by Epic 4 replay).
- [ ] **Task 9 — Tests**: Save disabled until stroke; onOK failure preserves state and shows
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

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-09-05 — Story revised for optional signature (requirement decision 2026-09-05: owner
  decides via `requireCompletionSignature`; step fully hidden when not required; no voluntary
  capture; BE Story 3-8 ships first). Original always-required ACs replaced; Tasks 2-5, 8
  added; original Tasks renumbered.