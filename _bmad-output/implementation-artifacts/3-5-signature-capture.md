# Story 3.5: Signature Capture

Status: ready-for-dev

## Story

As a technician,
I want to capture the customer's signature on my phone,
so that proof of acceptance exists before I mark the job complete.

## API Contract (api-contracts.md §8–§10 + §7)

Signature = same three-phase upload with `attachmentType: 'signature'`, `mimeType: 'image/png'`. One per job; re-confirm REPLACES the old one server-side (`conflict_resolved` logged). Old uploadIds of a replaced signature 404 on re-confirm (CR3.6-4) — never store uploadIds. After a confirmed signature, the step advance `POST /jobs/:id/workflow { step: 'signature_captured' }` is a separate call (the step does not auto-advance; only photos do).

## UI Design (ui-design-spec.md §11 — customer-facing screen, extra polish)

Back header "Customer signature". Column padding s4 gap s4: instruction body "Please ask the customer to sign below."; pad card = Card chrome (white, borderSubtle, radius.lg) flex-1 min-height 320, canvas clipped to the radius, with a 1px dashed baseline at ~70% height + caption textDisabled "Sign here" beneath it — both hide on first stroke; error line bodySm danger under the pad when upload fails (drawing preserved); footer row gap s3 = Button secondary md flex-1 "Clear" + Button primary md flex-1 "Save signature" (disabled until stroke, loading through upload+advance). Offline helper caption under the footer: "Signature upload needs internet." Pen colors.textStrong width ~2.5 on white. No emoji, no decorative flourish — this is the professional completion moment.

## Acceptance Criteria

1. **Given** the primary action "Capture signature" (Story 3.3 AC 4 — flip its TODO to navigate), **then** `Signature { jobId }` opens on TechnicianRootNavigator: full-screen pad (portrait, wide pad card on `colors.surfacePage`), pen `colors.textStrong`, Clear + Save buttons ≥ 44px, back header.
2. **Given** an empty pad, **then** Save is disabled (track `hasStroke` via the pad's onBegin/onEnd or onEmpty callbacks).
3. **Given** Save with strokes, **then** the drawn image exports to PNG and uploads via `useAttachmentUpload(jobId, 'signature')` (presign → PUT → confirm); on confirm success the screen calls `jobService.advanceWorkflow(jobId, 'signature_captured', generateIdempotencyKey())`, then pops back; TechJobDetail refetches (focus effect or onSaved callback) showing the signature row + advanced stepper. A 422 on the advance (step already recorded — e.g. offline race) reconciles silently per 3.3 AC 5 and still pops.
4. **Given** upload failure at any phase, **then** the pad stays open, the DRAWING IS PRESERVED, and a Retry re-runs from presign with fresh keys (3.4 AC 4 semantics); a persistent inline error line shows `ApiError.message`.
5. **Given** an existing signature on a non-terminal job, **then** the signature row in TechJobDetail shows a "Re-capture" affordance opening the same screen; success replaces the shown image (server last-write-wins); terminal jobs hide it.
6. **Given** no connectivity (Epic 4 will formalize), **then** THIS story disables Save with helper text "Signature upload needs internet" when a quick reachability probe fails (interim: attempt → network-class ApiError keeps pad open with that copy; Epic 4 swaps in the NetInfo check — leave `// EPIC4: NetInfo gate` marker).

## Tasks / Subtasks

- [ ] **Task 0 — Library decision + install**: PRIMARY `bun add react-native-signature-canvas react-native-webview` + pod install (signature-canvas renders in a WebView; webview supports new arch). Smoke-test on RN 0.86 FIRST (render pad, draw, read base64) — if the webview route fails on 0.86, FALLBACK `bun add react-native-signature-ink` (Fabric-native PencilKit/Android-ink, no webview). Record the decision, versions, and evidence in Dev Agent Record. API notes for the primary: `<SignatureScreen ref onOK={(base64DataUri) => ...} onBegin onEnd onEmpty webStyle={...} penColor backgroundColor />`, imperative `ref.readSignature()` triggers onOK, `ref.clearSignature()`.
- [ ] **Task 1 — Data-URI → upload input** (`src/utils/signatureExport.ts`, new): the pad returns `data:image/png;base64,<...>`. `putToPresignedUrl` needs a fetchable uri — a data URI IS fetchable by RN's fetch: `await (await fetch(dataUri)).blob()` works and yields the byte size; so pass the data URI straight through as `fileUri`. Provide `export function signatureFilename(jobId: string) { return `signature-${jobId}.png`; }`. If the data-URI fetch proves unreliable on-device, fallback: strip the prefix, write base64 to a temp file via a tiny native-free approach is NOT available without a fs lib — in that case switch the PUT body to `{ uri: dataUri }` native-networking form (see 3.4 Task 2 fallback). Spike, record.
- [ ] **Task 2 — Screen** (`features/technicianApp/SignatureScreen.tsx`, new; register `Signature: { jobId }` on TechnicianRootNavigator — param already typed in 3.1): layout = header (back + "Customer signature"), instruction line ("Ask the customer to sign below"), pad card (flex, radius.lg, borderSubtle), footer row Clear (secondary) + Save (primary, disabled per AC 2, loading during upload+advance); orchestration:
  ```ts
  const onSave = () => padRef.current?.readSignature();           // → onOK
  const onOK = async (dataUri: string) => {
    setBusy(true); setError(null);
    try {
      const { confirmed } = await uploadSignature(dataUri);       // useAttachmentUpload single-entry path
      try { await jobService.advanceWorkflow(jobId, 'signature_captured', generateIdempotencyKey()); }
      catch (e) { if (workflowCurrentStep(e as ApiError) === undefined) throw e; /* 422 already-recorded → fine */ }
      navigation.goBack();
    } catch (e) { setError((e as ApiError).message); }            // drawing preserved — do NOT clear
    finally { setBusy(false); }
  };
  ```
- [ ] **Task 3 — Hook generalization check** (`useAttachmentUpload`): confirm the 3.4 hook takes `attachmentType` and a single-file convenience (`uploadOne({ fileUri, filename, mimeType })` returning the ConfirmResponse) — add if 3.4 shipped grid-only.
- [ ] **Task 4 — Detail wiring** (`TechJobDetailScreen` + `AttachmentGrid`): signature row shows latest signature (attachments filtered type signature — if multiple ever appear, newest `createdAt` wins for display); "Re-capture" Pressable per AC 5; the 3.3 signature branch flips from direct-post to `navigation.navigate('Signature', { jobId })`, removing the `// TODO(3.5)`.
- [ ] **Task 5 — Tests**: Save disabled until stroke; onOK failure preserves state and shows error; 422-on-advance still navigates back; filename helper; display picks newest signature.

## Dev Notes

- Sequence is capture → upload → advance → back. The advance is best-effort-with-reconcile: a hard failure (network) leaves the user on the pad with the signature ALREADY uploaded — the retry path must then skip re-upload (track `confirmedThisSession` and retry only the advance). Implement that guard.
- No landscape work in Phase 1; the wide portrait card is sufficient.
- WebView note: keep the pad's `webStyle` minimal (background transparent, pen width ~2.5) — do not fight the design system inside the webview; the RN chrome around it carries the tokens.
- Files: NEW `features/technicianApp/SignatureScreen.tsx`, `src/utils/signatureExport.ts`; MODIFY `navigation/TechnicianRootNavigator.tsx` (register), `features/technicianApp/useAttachmentUpload.ts` (uploadOne), `TechJobDetailScreen.tsx`, `features/jobDetail/components/AttachmentGrid.tsx` (re-capture slot prop); package.json/ios pods; tests.
- [Source: api-contracts.md §7–§10; fenzit-be attachments.service.ts signature replace + CR3.6-4; web check 2026-09-01: signature-canvas requires react-native-webview; signature-ink = Fabric-native fallback].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
