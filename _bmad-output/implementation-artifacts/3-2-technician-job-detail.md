---
baseline_commit: abbf26b6df10aae66d3097d4119c5993512c68d6
---

# Story 3.2: Technician Job Detail

Status: review

## Story

As a technician,
I want the job's essentials and my next action on one screen,
so that I can work the job without hunting through menus.

## API Contract (api-contracts.md §4)

Same `GET /jobs/:id` `JobDetail` as Story 1.2. Technician-specific error: **403** when the job is no longer assigned to the caller (reassigned away). The stepper's done/pending derivation uses `currentStep` + the fixed order + `requireCompletionPhoto` (api-contracts.md §1, §7).

## UI Design (ui-design-spec.md §8, §9 — read both in full; this is the app's most important screen)

Back header: title = jobNumber, right slot = status Badge. ScrollView padding s4 gap s4, bottom padding s20 (clears 3.3's action bar). Card order: (1) Progress card — "Progress" label + right "N of 6" in progress.fg, then the WorkflowStepper; (2) Customer — PersonRow + tappable maps row (MapPin + textLink address + trailing Navigation icon, ≥44px); (3) Job details — Calendar/Clock/service meta rows + description behind a divider; (4) Notes from owner — AMBER-TINTED Card (`status.scheduled.bg` bg + `.border` border, heading in `.fg`) only when notes exist; (5) Photos (slot for 3.4; card present on non-terminal jobs even when empty); (6) Customer signature — tile per §4 or dashed placeholder "Captured at the signature step"; (7) History disclosure row (heading@16 + ChevronDown/Up, ≥44px) → collapsed ActivityTimeline.

Stepper rows (§9, minHeight 44 each, 24px left rail with 2px connectors): done = 22px filled green circle + white Check + caption timestamp; next = 22px primary-ring circle + 8px primary dot + bodyStrong label + caption primary "Up next"; locked = borderDefault ring + textDisabled label; skipped = DASHED ring + textMuted label + caption "Skipped"; pending (Epic 4) = amber-filled circle + caption "Waiting to sync". Exactly one 'next' visible on active jobs. 403 view: EmptyState(UserX) "This job is no longer assigned to you" / "It may have been reassigned." + "Go back". Copy from spec §15.

## Acceptance Criteria

1. **Given** a card tap from Today/History, **then** `TechJobDetailScreen` (replacing the 3.1 stub) fetches `jobService.getById(jobId)` and renders top-to-bottom: header (back IconButton + jobNumber + status Badge + urgent marker), WorkflowStepper (read-only this story), customer card, schedule/service card, owner notes card (only when `notesForTechnician` non-null, visually prominent — Card with `colors.status.scheduled.bg` tint), attachments section (grid slots reserved for 3.4/3.5 add controls), activity history behind a collapsible "History" disclosure (Pressable header toggling ActivityTimeline).
2. **Given** the customer card, **then**: name; phone row → `openTel(countryCode, phoneNumber)`; address row (address + city) → `openMaps(address, city)`; missing address renders no maps row.
3. **Given** the stepper, **then** for each of the 6 steps it shows: DONE (tick + timestamp from the matching `step_*` activity entry when present), CURRENT-NEXT (the single actionable position — rendered as the highlighted upcoming step; interactivity is 3.3), LOCKED (muted), or SKIPPED (`photos_uploaded` styled "Skipped" when `requireCompletionPhoto === false` AND `currentStep` index > photos index with no `step_photos_uploaded` log entry).
4. **Given** `status ∈ {completed, cancelled}`, **then** the screen is read-only: stepper shows final state, no action affordances, attachments view-only.
5. **Given** a 403, **then** "This job is no longer assigned to you" view with Back; on back, Today refetches (`loadToday({ force: true })`). **Given** 404, standard not-found. Pull-to-refresh refetches (fresh presigned URLs).

## Tasks / Subtasks

- [x] **Task 1 — Stepper derivation** (`features/technicianApp/stepperModel.ts`, new — PURE, heavily tested):
  ```ts
  export const STEP_ORDER = ['on_my_way','arrived','in_progress','photos_uploaded','signature_captured','completed'] as const;
  export type StepState = 'done' | 'next' | 'locked' | 'skipped';
  export interface StepView { step: (typeof STEP_ORDER)[number]; state: StepState; timestamp: string | null }
  export function buildStepper(job: Pick<JobDetail,'currentStep'|'requireCompletionPhoto'|'status'>, log: ActivityLogEntry[]): StepView[] {
    const curIdx = job.currentStep === null ? -1 : STEP_ORDER.indexOf(job.currentStep as any);
    const terminal = job.status === 'completed' || job.status === 'cancelled';
    const ts = (s: string) => log.find(e => e.eventType === `step_${s}`)?.createdAt ?? null;
    return STEP_ORDER.map((step, i) => {
      if (i <= curIdx) {
        const skipped = step === 'photos_uploaded' && !job.requireCompletionPhoto && !ts(step);
        return { step, state: skipped ? 'skipped' : 'done', timestamp: ts(step) };
      }
      const isNext = !terminal && (i === curIdx + 1 || (i === curIdx + 2 && STEP_ORDER[curIdx + 1] === 'photos_uploaded' && !job.requireCompletionPhoto));
      // When photos are skippable, signature_captured is the actionable next; photos_uploaded shows 'skipped-pending' → render as locked-with-skip-copy: keep simple — mark photos 'skipped' and signature 'next'.
      if (!job.requireCompletionPhoto && step === 'photos_uploaded' && curIdx === STEP_ORDER.indexOf('in_progress')) return { step, state: 'skipped', timestamp: null };
      return { step, state: isNext ? 'next' : 'locked', timestamp: null };
    });
  }
  ```
  (Exactly ONE 'next' must exist for non-terminal jobs whose currentStep !== 'completed' — assert in tests.)
- [x] **Task 2 — WorkflowStepper component** (`features/technicianApp/components/WorkflowStepper.tsx`, new): props `{ steps: StepView[]; onAdvance?: (step) => void; pendingStep?: string | null }` (onAdvance/pending used by 3.3 — render-only when absent); vertical list: tick circle (done, `colors.status.done`), highlighted pill (next), muted (locked), dashed/muted "Skipped" tag; labels from `STEP_LABELS` (Story 1.2 eventLabels file); timestamps `toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'})`.
- [x] **Task 3 — Screen** (`features/technicianApp/TechJobDetailScreen.tsx`, overwrite stub): fetch/loading/error/403/404 states; layout per AC 1; reuse Story 1.2's `PersonRow`, `AttachmentGrid`, `ActivityTimeline`, `SectionCard`, `openTel`/`openMaps`.
- [x] **Task 4 — 403 handling + Today refetch**: catch `ApiError.status === 403` → dedicated view; `navigation.addListener('beforeRemove')` or the back handler triggers `loadToday({ force: true })`.
- [x] **Task 5 — Tests** (`__tests__/stepperModel.test.ts`) — enumerate ALL: fresh job (curIdx -1) → on_my_way is next; each mid-state; requireCompletionPhoto=false at in_progress → photos 'skipped' + signature 'next'; requireCompletionPhoto=true at in_progress → photos 'next'; completed job → all done/skipped, none 'next'; cancelled mid-way → no 'next'; timestamps come from log; exactly-one-next invariant.

### Review Findings

- [x] [Review][Decision] Terminal job with no signature omits the card — §8.6 defines only tile-or-placeholder, no omit case. **Resolved: the card always renders** (dashed placeholder for a cancelled job that never reached the signature step) — spec-literal, no undocumented omit case.
- [x] [Review][Decision] TechJobDetailScreen.tsx is ~600 lines vs the ~300-line rule. **Resolved: split** — screen (state/header, 297 lines), `TechJobDetailContent` (the §8 cards, 292), `SignatureTile` (§4 tile, 72), `DetailErrorViews` (403/404/failed views, 70).
- [x] [Review][Patch] 403 during pull-to-refresh is swallowed — **fixed:** the 403 branch now arms `wasUnassignedRef` and surfaces the unassigned view on EVERY load (mount or refresh), so the `beforeRemove` Today refetch always fires; pinned by a test.
- [x] [Review][Patch] Full `JobDetail` (incl. presigned URLs) pushed into the shared store — **fixed:** `apiJobOf()` strips technician/customer/activityLog/attachments before `upsertTechnicianJob`; pinned by a test asserting the detail-only keys are absent.
- [x] [Review][Patch] No screen tests — **fixed:** `__tests__/tech-job-detail-screen.test.tsx` (10 tests): layout, 403 on mount AND on refresh, 404, error+Retry, 403-leaving Today refetch, signature card cases, history disclosure, store-subset.
- [x] [Review][Patch] `stepperModel.STEP_ORDER` duplicate unpinned — **fixed:** two tests pin it to `eventLabels.STEP_ORDER` and require a `STEP_LABELS` entry per step.
- [x] [Review][Patch] Local SignatureTile deviates from §4 and doesn't key by URL — **fixed:** extracted to `components/SignatureTile.tsx` with the §4 white tile (borderSubtle/radius.md/s2 padding), surfaceSunken+ImageOff placeholder, and the parent keys it by URL so a refetch clears a failed tile.
- [x] [Review][Patch] Error-view "Go back" renders primary — **fixed:** `EmptyState` gained a `ctaVariant` prop; both error views pass `secondary`.
- [x] [Review][Patch] Invented copy "Nothing logged yet." — **fixed:** the open disclosure renders `ActivityTimeline` unconditionally (it renders nothing when the log is empty).
- [x] [Review][Patch] Missing trailing newline on 4 changed files — **fixed** (verified on all 7 touched files).
- [x] [Review][Defer] No accessibilityLiveRegion / image accessibility roles on the new surfaces — deferred, pre-existing pattern gap across screens
- [x] [Review][Defer] No testIDs on new interactive surfaces (stepper rows, history toggle, maps row, Retry) — deferred until Story 3.3 wires interactivity

## Dev Notes

- The stepper model is the single trickiest logic in Epic 3 — 3.3's interactivity and 4.2's optimistic application both build on `buildStepper`; correctness here prevents three stories of bugs.
- No mutations in this story — mergeable before 3.3.
- Keep screen fetch local-state like 1.2; on success also `upsertJob(subsetAsApiJob)` into the technician store so list badges stay fresh.
- Files: NEW `features/technicianApp/stepperModel.ts`, `features/technicianApp/components/WorkflowStepper.tsx`; MODIFY `features/technicianApp/TechJobDetailScreen.tsx`, `features/technicianApp/index.ts`; tests.
- [Source: api-contracts.md §1, §4, §7; fenzit-be workflow.service.ts STEP_ORDER + validateStep (mirror its skip rule EXACTLY); 1-2 components].

## Dev Agent Record

### Agent Model Used

Claude (GLM via Claude Code), 2026-09-04

### Debug Log References

- `bunx tsc --noEmit` — clean
- `bun run test -- --watchman=false` — 29 suites / 267 tests pass (16 new stepper tests)
- `bun run lint` — not runnable in this repo: no ESLint config file exists (pre-existing; not introduced by this story)

### Completion Notes List

- `stepperModel.ts` implements the story's reference `buildStepper` verbatim in semantics, typed without `as any` (`STEP_ORDER.indexOf(job.currentStep)` accepts the union directly). An unknown `currentStep` reads as -1, so `on_my_way` renders as next — same as the reference spec.
- `WorkflowStepper.tsx` renders §9 styling (22px glyphs, 24px rail with 2px connectors tinted green into done rows, per-state labels/captions, `en-IN` time captions). `onAdvance`/`pendingStep` are accepted but unwired (3.3/4.2 seams); without `onAdvance` no Pressable is rendered, so rows are inert. The pending (amber, "Waiting to sync") glyph style is implemented now per §9.
- `TechJobDetailScreen.tsx` follows §8 exactly: Progress card ("N of 6" / "Done" + stepper), Customer card (PersonRow + tappable maps row with trailing Navigation icon, omitted when no address), Job details card (date/time/service rows + description behind divider), amber "Notes from owner" card (only when notes exist), Photos card (non-terminal even when empty — 3.4 slot), Customer signature card (captured tile or dashed "Captured at the signature step." placeholder; omitted for terminal jobs with no signature), History disclosure (collapsed by default, ActivityTimeline on expand). Header = back + jobNumber + Urgent/status badges.
- 403 renders the UserX EmptyState copy from §15; a `beforeRemove` listener (covers header back, EmptyState "Go back", and hardware/gesture back) fires `loadToday({ force: true })` so the stale card is gone on return. 404 keeps the §3 not-available view. Pull-to-refresh refetches (fresh presigned URLs).
- On a successful fetch the full `JobDetail` row is pushed into the technician store via `upsertTechnicianJob` (replace-in-place, so list badges stay fresh); the fetch itself is screen-local state like 1.2, with abort-on-unmount and a single-flight busy guard.
- `index.ts` needed no change — the screen was already exported in 3.1, and the stepper/component stay internal to the feature.
- Reused `PersonRow`, `AttachmentGrid`, `ActivityTimeline`, `formatPhone`, `openMaps`, `statusToBadge`/`formatTimeLabel`/`serviceTypeLabel`/`serviceTypeToIcon`, and `STEP_LABELS` from the owner-side feature; a local `dateLine` helper (same format as 1.2's, which is not exported).
- Notes: the empty-photos AttachmentGrid renders nothing by design — the visible "Add photo" tile arrives with 3.4's PhotoSection. Signature for terminal jobs without one omits the card (a cancelled/completed job will never gain a signature).

### File List

- src/features/technicianApp/stepperModel.ts (new)
- src/features/technicianApp/components/WorkflowStepper.tsx (new)
- src/features/technicianApp/components/SignatureTile.tsx (new — review round 1)
- src/features/technicianApp/components/DetailErrorViews.tsx (new — review round 1)
- src/features/technicianApp/components/TechJobDetailContent.tsx (new — review round 1)
- src/features/technicianApp/TechJobDetailScreen.tsx (modified — stub replaced; split in review round 1)
- src/components/ui/EmptyState.tsx (modified — review round 1: `ctaVariant` prop)
- __tests__/stepperModel.test.ts (new)
- __tests__/tech-job-detail-screen.test.tsx (new — review round 1)

## Change Log

- 2026-09-04: Story 3.2 implemented — stepper model + WorkflowStepper + full technician job detail screen (fetch/403/404/error states, §8 card layout), 16 new unit tests; full suite green (267 tests).
- 2026-09-04: Review round 1 applied (2 decisions + 8 patches + 2 defers) — 403 surfaced on every load, store gets ApiJob-only subset, screen split into 4 files (all ≤300 lines), §4 SignatureTile keyed by URL, secondary error CTAs (`EmptyState.ctaVariant`), signature card always renders, invented copy removed, STEP_ORDER pinned to eventLabels, 10 new screen tests + 2 pin tests; suite green (30 suites / 279 tests).
