---
baseline_commit: 569f1cf05c37a1b3ca38935a42f9de086db00a8c
---

# Story 3.3: Workflow Step Advancement

Status: done

## Story

As a technician,
I want one-tap progress reporting through the fixed six-step order,
so that the owner sees my real-time progress and nothing needs typing in the field.

## API Contract (api-contracts.md §7 — read fully)

`POST /jobs/:id/workflow` body `{ step }`, optional header `X-Idempotency-Key` (uuid v4, 24h dedup). 200 → full `ApiJob`. Transitions: on_my_way → status in_progress; completed → status completed. Same-step repost → 200 current state (no new log). 422 `INVALID_WORKFLOW_STEP` body carries top-level `currentStep` (read via `ApiError.details`). 409 `JOB_NOT_MODIFIABLE` = terminal OR lost race → ALWAYS refetch-and-reconcile. 403/404 as usual.

## UI Design (ui-design-spec.md §9 — bottom action bar)

ONE bottom action bar, absolutely positioned: surfaceCard bg, top hairline borderSubtle, upward shadow.md, padding s4 + safe-area bottom. Content = single Button primary lg fullWidth labeled by the next step ("On my way" / "Arrived" / "Start work" / "Capture signature" / "Mark complete"), loading while posting. Photo-required state (requireCompletionPhoto && in_progress): the bar shows a NON-tappable info pill instead — Camera 18 progress.fg + bodySm "Upload a photo to continue" on progress.bg, radius.md, padding s3 (the Photos card above carries the action). Completed: bar content = CheckCircle2 20 done.solid + bodyStrong done.fg "Job completed" (static, no animation). Terminal/cancelled: no bar. Errors surface as an InlineError line above the bar; 422 reconciliation is SILENT (stepper just re-renders correct state).

## Acceptance Criteria

1. **Given** a non-terminal job on TechJobDetail, **then** exactly one primary Button renders at the bottom (safe-area padded, full width), labeled by the 'next' step from `buildStepper`: on_my_way→"On my way", arrived→"Arrived", in_progress→"Start work", photos_uploaded→(NEVER a button — see AC 3), signature_captured→"Capture signature", completed→"Mark complete".
2. **Given** a tap, **then** the button enters loading (Button's loading prop; double-tap impossible), the request fires with a FRESH `generateIdempotencyKey()` header, and on 200: local detail merges the returned `ApiJob`, `upsertJob(response)` updates the technician store, the stepper re-derives, and if step was `completed` a subtle success state shows (tick + "Job completed" line, no confetti/emoji) and the primary button disappears.
3. **Given** `requireCompletionPhoto === true` and current step `in_progress`, **then** the primary action area shows a non-button hint card "Upload a photo to continue" (photos step auto-advances server-side on first photo confirm — Story 3.4); after the confirm lands (detail refetch), signature becomes the next action.
4. **Given** the next step is `signature_captured`, **then** the button navigates to `Signature { jobId }` (Story 3.5) instead of posting directly — INTERIM until 3.5 merges: post directly (dev path), switch to navigation in 3.5 (leave a `// TODO(3.5)` marker).
5. **Given** a 422 `INVALID_WORKFLOW_STEP`, **then** NO error UI: read `currentStep` from `ApiError.details`, patch it into local detail + store, re-derive the stepper (silent reconcile).
6. **Given** a 409, **then** toast/inline "This job can no longer be updated" + full detail refetch. **Given** a network-class error (`status === 0`), **then** this story shows the error inline with retry (Epic 4 replaces this branch with enqueue — leave a `// EPIC4: enqueue here` marker at the exact catch site).

## Tasks / Subtasks

- [x] **Task 1 — Idempotency util** (`src/utils/idempotency.ts`, new):
  ```ts
  export function generateIdempotencyKey(): string {
    const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } };
    if (g.crypto?.randomUUID) return g.crypto.randomUUID();
    const bytes = g.crypto?.getRandomValues ? g.crypto.getRandomValues(new Uint8Array(16)) : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const h = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
    return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10).join('')}`;
  }
  ```
  (Hermes on RN 0.86 has `crypto.getRandomValues`; `randomUUID` availability varies — the ladder covers all cases with zero dependencies. Verify at runtime and note which branch fires in Dev Agent Record.)
- [x] **Task 2 — ApiError details typing**: confirm `apiError.ts` already sets `details: data` (it does, L102) — add an exported helper `export function workflowCurrentStep(e: ApiError): string | null | undefined { const d = e.details as { currentStep?: string | null } | undefined; return e.code === 'INVALID_WORKFLOW_STEP' ? d?.currentStep : undefined; }` in `services/api/apiError.ts`.
- [x] **Task 3 — Service** (`services/resources/jobs.ts`):
  ```ts
  async function advanceWorkflow(id: string, step: WorkflowStepApi, idempotencyKey: string): Promise<ApiJob> {
    const res = await apiClient.post<ApiJob>(`/jobs/${id}/workflow`, { step }, { headers: { 'X-Idempotency-Key': idempotencyKey } });
    return res.data;
  }
  ```
- [x] **Task 4 — Stepper interactivity** (`WorkflowStepper.tsx`): honour `onAdvance`/`pendingStep` props (3.2 stubbed them) — the 'next' row gets a subtle pressed state while pending; the PRIMARY action button itself lives on the screen (bottom bar), not inside the stepper rows (44px+ target, thumb reach).
- [x] **Task 5 — Screen orchestration** (`TechJobDetailScreen`):
  ```ts
  const [pendingStep, setPendingStep] = useState<string | null>(null);
  const advance = async (step: WorkflowStepApi) => {
    setPendingStep(step);
    try {
      const job = await jobService.advanceWorkflow(jobId, step, generateIdempotencyKey());
      setDetail(d => d ? { ...d, ...job } : d); upsertJob(job);
      // append an optimistic log entry locally? NO — refetch lazily; timestamps come from next refetch
    } catch (e) {
      const err = e as ApiError;
      const cur = workflowCurrentStep(err);
      if (cur !== undefined) { setDetail(d => d ? { ...d, currentStep: cur } : d); /* + upsertJob patched */ return; }
      if (err.code === 'JOB_NOT_MODIFIABLE') { showInline('This job can no longer be updated'); await refetch(); return; }
      if (err.status === 0) { /* EPIC4: enqueue here */ showInline(err.message); return; }
      showInline(err.message);
    } finally { setPendingStep(null); }
  };
  ```
  Button label map + AC 3 hint card + AC 4 signature branch.
- [x] **Task 6 — Tests**: label map per next step incl. photo-hint and signature branches; 422 reconcile patches currentStep and shows no error; 409 triggers refetch; idempotency header present (assert on mocked axios call); generateIdempotencyKey shape (regex v4) and uniqueness over 1000 calls.

### Review Findings

#### Decision

- [x] [Review][Decision] Stepper 'next'-row pressability is a second tappable advance affordance — Task 4 spells out only a "subtle pressed state while pending" for that row; making it fire `onAdvance` (posting to the BE) is an interpretation, not spelled-out behavior. Decision: keep the row tappable (secondary affordance), make it display-only (pressed state only, all advancing via the bottom bar), or keep tappable but only for steps the bar also offers as a button (the photos_uploaded exclusion in the Patch list applies either way).
  **Resolved (user, 2026-09-05): middle option** — the row stays tappable EXCEPT `photos_uploaded`, which is display-only in every state (that step advances server-side on photo confirm; a direct POST would skip the required photo).

#### Patches

- [x] [Review][Patch] Stepper's `photos_uploaded` 'next' row is tappable and posts the step directly — BE `validateStep` accepts `in_progress → photos_uploaded` without checking any photo was uploaded, so a tap advances the job past its required completion photo. Make this row non-pressable (mirror the bar's non-tappable pill) [src/features/technicianApp/components/WorkflowStepper.tsx:67]
- [x] [Review][Patch] Double-tap guard is render-based only — two taps inside one frame both see `pendingStep === null` and fire two posts with two different keys; add a `pendingStepRef` guard like the file's own `isBusyRef` [src/features/technicianApp/TechJobDetailScreen.tsx:198]
- [x] [Review][Patch] Retry after an offline advance mints a FRESH idempotency key — a timeout-after-server-processed retry double-advances; reuse the key minted for the pending action until it succeeds [src/features/technicianApp/TechJobDetailScreen.tsx:205]
- [x] [Review][Patch] 409 locked branch's `load(false)` is a silent no-op when a load/refresh is already in flight (`isBusyRef` guard) — the mandated refetch-and-reconcile is skipped; chain the refetch after the in-flight load [src/features/technicianApp/TechJobDetailScreen.tsx:228]
- [x] [Review][Patch] 422 reconcile writes the store row from the render-closure `detail` (pre-refresh snapshot) while the detail patch is functional — a refresh that committed between tap and 422 gets overwritten in the store; compute the row from the same fresh state the detail patch uses [src/features/technicianApp/TechJobDetailScreen.tsx:219-221]
- [x] [Review][Patch] A 422 `INVALID_WORKFLOW_STEP` whose body carries no `currentStep` falls through to the generic branch and renders the raw backend message — AC5 promises no error UI for this code; fall back to a silent refetch instead (and gate the reconcile branch on `status === 422`, not the code alone) [src/features/technicianApp/workflowActionBarModel.ts:70-76]
- [x] [Review][Patch] A 403 on advance renders the backend's raw message inline, while a 403 on load routes to the dedicated UnassignedView — spec says "403/404 as usual"; classify 403 so the screen routes it to the unassigned view [src/features/technicianApp/workflowActionBarModel.ts:75]
- [x] [Review][Patch] Nothing schedules the "next refetch" after an advance or a 422 reconcile — the just-advanced step shows no timestamp and a 422-reconciled job keeps its pre-race `status` (badge diverges) until a manual pull-to-refresh; fire a silent `load(false)` after success and reconcile [src/features/technicianApp/TechJobDetailScreen.tsx:209]
- [x] [Review][Patch] A pull-to-refresh fetch in flight when the advance response lands commits AFTER it and overwrites the merged step (bar re-offers the taken step); sequence detail commits with a generation ref (advance bumps it, `load` discards a commit that lost the race) [src/features/technicianApp/TechJobDetailScreen.tsx:119]
- [x] [Review][Patch] `actionError` is never cleared by a successful load — a successful refresh or the 409 refetch leaves stale error copy over fresh job state (e.g. "This job can no longer be updated" above the completed tick); clear it in `load`'s success path [src/features/technicianApp/TechJobDetailScreen.tsx:120]
- [x] [Review][Patch] `classifyAdvanceError` keys the 409 branch on `err.code === 'JOB_NOT_MODIFIABLE'` — a 409 whose body omits `error_code` falls back to `REQUEST_ERROR` and renders the raw message; key on `status === 409` [src/features/technicianApp/workflowActionBarModel.ts:73]
- [x] [Review][Patch] `classifyAdvanceError` assumes its input is a well-formed `ApiError` — a non-ApiError thrown in the try (e.g. key-mint failure) leaks its internal message into the UI; add a shape check mapping it to a generic message [src/features/technicianApp/workflowActionBarModel.ts:70]
- [x] [Review][Patch] The 422 reconcile casts `plan.currentStep as WorkflowStepApi` without validating — an unexpected wire value would corrupt `detail` and the store (`STEP_ORDER.indexOf` −1); validate against `STEP_ORDER` and fall back to a refetch [src/features/technicianApp/TechJobDetailScreen.tsx:217]
- [x] [Review][Patch] No test covers the stepper's advance path at all — deleting `onPress` from the stepper's Pressable (or unthreading `onAdvance` in TechJobDetailContent) passes every suite; add tests: pressing the 'next' row calls `onAdvance`, done/locked/skipped rows render no Pressable [src/features/technicianApp/components/WorkflowStepper.tsx:67]
- [x] [Review][Patch] `WorkflowActionBar.test.tsx`'s "`none`" test is a no-op — the cast value renders the completed row and `not.toThrow()` passes regardless; make it meaningful or drop it [src/features/technicianApp/components/WorkflowActionBar.test.tsx:100]
- [x] [Review][Patch] `Button`'s new `loading` prop is untested — no test asserts the spinner renders or that pressing is blocked while loading [src/components/ui/Button.tsx:23]
- [x] [Review][Patch] Two screen test titles cite the wrong ACs — "offline advance … (AC3/AC4)" is AC6; "422 step race … (AC3)" is AC5 [__tests__/tech-job-detail-screen.test.tsx:427]
- [x] [Review][Patch] Extract the ~50-line advance orchestration from TechJobDetailScreen into a `useWorkflowAdvance` hook next to `workflowActionBarModel` — the screen file is past the ~300-line one-responsibility limit [src/features/technicianApp/TechJobDetailScreen.tsx:196-243]
- [x] [Review][Patch] `ADVANCE_LABELS.photos_uploaded` is unreachable (the model returns `photoHint` before consulting the map) and the pill's string is duplicated in WorkflowActionBar — type the map as `Exclude<WorkflowStep, 'photos_uploaded'>` and share the constant [src/features/technicianApp/workflowActionBarModel.ts:30]
- [x] [Review][Patch] Docs gaps: `DESIGN_SYSTEM.md` not updated for `Button`'s `loading` prop; shadow substitution (upward `shadow.sheet` used where §9 names `shadow.md`, which is a downward token) not recorded in the story record [src/components/ui/Button.tsx]

## Dev Notes

- Keys are generated AT ACTION CREATION and passed in — never inside the service function — because Epic 4 replays the SAME key for a queued action. The service signature therefore requires the key.
- Never trust local state after any 4xx: 422 → reconcile from body; 409 → refetch; both silent-or-gentle, never raw codes.
- `completed` moves the job out of Today's active sections on next `loadToday` — do not hand-remove from the array (upsert keeps it; sections re-derive).
- Files: NEW `src/utils/idempotency.ts`; MODIFY `services/api/apiError.ts`, `services/resources/jobs.ts` + barrel, `features/technicianApp/components/WorkflowStepper.tsx`, `features/technicianApp/TechJobDetailScreen.tsx`; tests.
- [Source: api-contracts.md §7; fenzit-be workflow.service.ts (same-step no-op L156–172, 422 body L184–192, PT409 L219–227); deferred-work CR1].

## Dev Agent Record

### Agent Model Used

Claude Code (glm-5.3-flash) — BMAD dev-story workflow, 2026-09-04.

### Debug Log References

- `bunx tsc --noEmit` — clean (0 errors).
- `bun run test -- --watchman=false` — **35 suites / 314 tests, all passing** (43 new tests for this story).
- `bun run lint` — NOT run to completion: the repo has no ESLint config (pre-existing; ESLint 8.57.1 installed but `.eslintrc` never set up). Left as-is; not a story blocker.
- Watchman is blocked in the agent sandbox — all jest runs need `--watchman=false` (known repo quirk).
- **Review round (2026-09-05), post-patches:** `bunx tsc --noEmit` — clean; `bun run test -- --watchman=false` — **37 suites / 328 tests, all passing**.

### Completion Notes List

- **BE contract verified against fenzit-be source** (user requirement): `workflow.service.ts`, `idempotency.interceptor.ts`, `global-exception.filter.ts`. Confirmed: 422 body carries top-level `currentStep` (forwarded verbatim by `GlobalExceptionFilter` → read via `ApiError.details`); 409 `JOB_NOT_MODIFIABLE` = terminal OR PT409 lost race, indistinguishable client-side → refetch-and-reconcile; same-step repost → 200 no-op returning full ApiJob; `X-Idempotency-Key` optional but strictly regex-validated uuid v4 (malformed → 422) with 24h replay window scoped to method+path.
- **Idempotency-key ladder branch**: on device, Hermes (RN 0.86) provides `crypto.getRandomValues` but NOT `crypto.randomUUID`, so the **getRandomValues + manual v4-bit branch fires on device**; the `randomUUID` fast path fires in Jest/Node tests. Both branches are unit-tested (`idempotency.test.ts` mocks out `randomUUID` to force the fallback).
- **Design deviation (improvement) from the task sketches**: the button-label map + error classification were extracted into a pure model `src/features/technicianApp/workflowActionBarModel.ts` (`actionBarAction`, `classifyAdvanceError`, `ADVANCE_LABELS`, `JOB_LOCKED_MESSAGE`) so both are unit-testable without rendering — mirrors the `editJobModel` precedent. The screen stays thin (state + call only), and the bar is a separate presentational component `components/WorkflowActionBar.tsx` (spec §9 overlay) rather than inline JSX in the screen.
- **Button DS extension**: `components/ui/Button.tsx` gained a `loading` prop (spinner in the leading slot, disabled while loading, press animations skipped) — per design non-negotiables, the DS component was extended rather than hard-coding a spinner in the screen. AC2's "double-tap impossible" rides on it.
- **photos_uploaded derivation**: the AC3 hint pill needs no `requireCompletionPhoto && in_progress` special-case in the UI — `buildStepper` already marks `photos_uploaded` as `next` in exactly that case; the model maps it to `{ kind: 'photoHint' }`. Covered by model tests.
- **signature_captured interim (AC4)**: posts directly with a `// TODO(3.5)` marker at the call site (screen `advance` callback) — switches to Signature navigation in 3.5.
- **Offline branch (AC6)**: `// EPIC4: enqueue here` marker sits at the exact catch site; until Epic 4, the inline error shows and the button itself is the retry.
- **Stepper pressability**: only the `next` row is tappable and only when `onAdvance` is wired — it is the SECONDARY target (the bottom bar is primary, per spec §9 thumb-reach reasoning). `pendingStep` gives the in-flight row opacity 0.6.
- **422 reconcile** patches `currentStep` into BOTH the open detail and the store (via the store-safe `apiJobOf(detail)` spread) — verified by a screen test asserting the store row's `currentStep` changed and no error copy rendered.
- **Test quirk**: react-test-renderer + React 19 can surface one host element as two traversal entries (stale alternate fibers) — bar tests assert `length > 0` / filtered-by-`onPress` instead of exact counts.
- **Screen tests** gained 6 advance-path tests (success merge + store upsert + key assertion, silent 422 reconcile, 409 fixed copy + refetch, offline inline error + retry, completed static row, cancelled no-bar); the file now wraps mounts in `SafeAreaProvider` (the bar reads `useSafeAreaInsets`) and pins `generateIdempotencyKey` for verbatim header assertion.

### Review Round (2026-09-05) — all 20 patches + 1 decision applied

- **Decision applied (middle option):** the stepper's 'next' row stays tappable EXCEPT `photos_uploaded`, which is display-only in every state — that step advances server-side when a photo is confirmed (fenzit-be Story 3.6), and the backend would accept a direct POST without checking any photo was uploaded. The bar's pill (and 3.4's capture) is the only path through the photo step.
- **Advance orchestration extracted** into `useWorkflowAdvance.ts` (the screen file had crossed the ~300-line one-responsibility limit). The hook owns: a `pendingRef` double-tap guard (state alone races React's batching), idempotency-key REUSE until the server actually responds (`keyRef` — cleared on any server status, kept on status 0 so an offline retry replays the same submit; the Epic 4 seam), a `detailRef` mirror so the reconcile branch computes the store row from the same state the functional `setDetail` patches, and silent `load(false)` resyncs after success/reconcile.
- **Refetch sequencing hardened in the screen's `load`:** requests chain behind the one in flight instead of being dropped (the 409/422-mandated refetches can no longer silently no-op), and a `detailGenRef` generation guard discards a commit that raced a landing advance (an in-flight pull-to-refresh can no longer overwrite the merged step and re-offer the taken one).
- **Model hardening (`classifyAdvanceError`):** 422 branch gated on `status === 422 && code === 'INVALID_WORKFLOW_STEP'` (the code alone is not a reconcile); a step race with no `currentStep` in the body → new `reconcileRefresh` branch (silent refetch, AC5 honoured); 409 keyed on the STATUS, not the code (a missing `error_code` no longer leaks the raw message); 403 → new `unassigned` branch routed to the screen's UnassignedView (same as a 403 on load); non-`ApiError` shapes → the shared `FALLBACK_ERROR_MESSAGE` (exported from `apiError.ts`, replacing `defaultMessageForStatus`'s private literal).
- **Stale-error hygiene:** a fresh refetch commit clears the bar's inline error via `clearActionErrorRef` (a 409 message no longer sits above the completed tick); the 409 message is set AFTER its refetch so the clear can't wipe it; the reconcile validates `currentStep` against `STEP_ORDER` and falls back to a refetch for an unexpected wire value.
- **Copy/type hygiene:** `ADVANCE_LABELS` typed `Exclude<WorkflowStep, 'photos_uploaded'>` (the unreachable entry deleted); the pill's string shared as `PHOTO_HINT_MESSAGE`; `pendingStep` tightened to `WorkflowStep | null` through the component chain.
- **`shadow.sheet` substitution recorded (was a review docs gap):** spec §9 names `shadow.md` for the bottom bar, but `shadow.md` is a DOWNWARD token — the bar correctly uses `shadow.sheet` (upward), which is the right token for a bottom-anchored sheet. Spec bug, not a code bug; left as-is deliberately.
- **Test coverage added for the seams the review flagged:** new `WorkflowStepper.test.tsx` (next-row press fires `onAdvance`; done/locked/skipped rows render no Pressable; the photos_uploaded 'next' row is display-only; pending shows "Waiting to sync"), new `Button.test.tsx` (`loading` → spinner renders, pressable disabled, press feedback detached), model tests for the new branches (reconcileRefresh, 409-by-status, 403→unassigned, non-ApiError shape, code-with-wrong-status), the screen tests mock the chained resync responses and cite the correct ACs (offline → AC6, 422 → AC5), and the no-op `none` bar test was dropped.
- **Test quirk (new):** RN's jest mock makes `findAllByType(Pressable)` return ZERO matches — pressables must be located by props (`testID` / `accessibilityRole`) in tests, mirroring the existing duplicate-fiber workaround.

### File List

**New:**
- `src/utils/idempotency.ts` — `generateIdempotencyKey()` (randomUUID → getRandomValues+manual v4 → Math.random ladder)
- `src/utils/idempotency.test.ts`
- `src/services/api/apiError.test.ts` — `workflowCurrentStep` helper tests
- `src/services/resources/jobs.test.ts` — advanceWorkflow URL/body/header test
- `src/features/technicianApp/workflowActionBarModel.ts` — pure action derivation + advance-error classification
- `src/features/technicianApp/workflowActionBarModel.test.ts` (13 tests)
- `src/features/technicianApp/components/WorkflowActionBar.tsx` — spec §9 bottom bar (button / photo-hint pill / completed row + InlineError)
- `src/features/technicianApp/components/WorkflowActionBar.test.tsx` (7 tests)
- `src/features/technicianApp/useWorkflowAdvance.ts` — advance state machine (review round: extracted from the screen; double-tap guard, idempotency-key reuse, gen-guarded commits, chained resyncs)
- `src/features/technicianApp/components/WorkflowStepper.test.tsx` — stepper advance-path render tests (review round)
- `src/components/ui/Button.test.tsx` — `loading` prop tests (review round)

**Modified:**
- `src/utils/index.ts` — barrel export of `generateIdempotencyKey`
- `src/services/api/apiError.ts` — added `workflowCurrentStep(e)` helper; review round: exported `FALLBACK_ERROR_MESSAGE`
- `src/services/resources/jobs.ts` — added `advanceWorkflow(id, step, idempotencyKey)` to `jobService` (key minted by the CALLER — Epic 4 replay seam)
- `src/components/ui/Button.tsx` — added `loading` prop
- `src/features/technicianApp/components/WorkflowStepper.tsx` — 'next' row pressable via `onAdvance`, `pendingStep` pressed state (opacity 0.6); review round: photos_uploaded row never pressable, `pendingStep` typed `WorkflowStep | null`
- `src/features/technicianApp/components/TechJobDetailContent.tsx` — threads `onAdvance`/`pendingStep` to the stepper
- `src/features/technicianApp/TechJobDetailScreen.tsx` — 3.3 bar mount + branch routing; review round: advance orchestration moved to `useWorkflowAdvance`, `load` gained chained reloads + a generation-guarded commit, 403 routing extracted to `showUnassigned`
- `src/features/technicianApp/workflowActionBarModel.ts` — review round: hardened `classifyAdvanceError` (422 gate, reconcileRefresh, 409-by-status, unassigned, shape check), `PHOTO_HINT_MESSAGE`, `Exclude`-typed `ADVANCE_LABELS`
- `src/features/technicianApp/components/WorkflowActionBar.tsx` — review round: uses the shared `PHOTO_HINT_MESSAGE`
- `src/features/technicianApp/useTechnicianJobs.ts` — review round: received the shared `apiJobOf` (store-row stripper)
- `src/theme/DESIGN_SYSTEM.md` — review round: documented the Button `loading` prop
- `__tests__/tech-job-detail-screen.test.tsx` — SafeAreaProvider wrap, advance mocks, 6 new advance-path tests; review round: resync response chains, AC-title fixes

## Change Log

- 2026-09-04 — Story 3.3 implemented (all 6 tasks complete): one-tap workflow advance on the technician job detail. New idempotency util, `advanceWorkflow` service with caller-minted key, pure action-bar model + WorkflowActionBar component, Button `loading` prop, stepper 'next'-row pressability, screen orchestration with verified BE error contract (silent 422 reconcile, fixed-copy 409 + refetch, offline inline error). Status → review.
- 2026-09-05 — BMAD code review round complete: 1 decision (stepper pressability — middle option: tappable except photos_uploaded) + all 20 patches applied. Advance orchestration extracted to `useWorkflowAdvance.ts`; refetch chaining + generation guard in the screen; error classification hardened (422 gate, reconcileRefresh, 409-by-status, 403→unassigned, non-ApiError shape check); idempotency-key reuse; stale-error hygiene; new stepper + Button test files; DESIGN_SYSTEM.md Button-loading note; shadow.sheet substitution recorded. 37 suites / 328 tests green, tsc clean. Status → done.
