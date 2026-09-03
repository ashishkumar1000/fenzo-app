# Story 3.2: Technician Job Detail

Status: ready-for-dev

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

- [ ] **Task 1 — Stepper derivation** (`features/technicianApp/stepperModel.ts`, new — PURE, heavily tested):
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
- [ ] **Task 2 — WorkflowStepper component** (`features/technicianApp/components/WorkflowStepper.tsx`, new): props `{ steps: StepView[]; onAdvance?: (step) => void; pendingStep?: string | null }` (onAdvance/pending used by 3.3 — render-only when absent); vertical list: tick circle (done, `colors.status.done`), highlighted pill (next), muted (locked), dashed/muted "Skipped" tag; labels from `STEP_LABELS` (Story 1.2 eventLabels file); timestamps `toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'})`.
- [ ] **Task 3 — Screen** (`features/technicianApp/TechJobDetailScreen.tsx`, overwrite stub): fetch/loading/error/403/404 states; layout per AC 1; reuse Story 1.2's `PersonRow`, `AttachmentGrid`, `ActivityTimeline`, `SectionCard`, `openTel`/`openMaps`.
- [ ] **Task 4 — 403 handling + Today refetch**: catch `ApiError.status === 403` → dedicated view; `navigation.addListener('beforeRemove')` or the back handler triggers `loadToday({ force: true })`.
- [ ] **Task 5 — Tests** (`__tests__/stepperModel.test.ts`) — enumerate ALL: fresh job (curIdx -1) → on_my_way is next; each mid-state; requireCompletionPhoto=false at in_progress → photos 'skipped' + signature 'next'; requireCompletionPhoto=true at in_progress → photos 'next'; completed job → all done/skipped, none 'next'; cancelled mid-way → no 'next'; timestamps come from log; exactly-one-next invariant.

## Dev Notes

- The stepper model is the single trickiest logic in Epic 3 — 3.3's interactivity and 4.2's optimistic application both build on `buildStepper`; correctness here prevents three stories of bugs.
- No mutations in this story — mergeable before 3.3.
- Keep screen fetch local-state like 1.2; on success also `upsertJob(subsetAsApiJob)` into the technician store so list badges stay fresh.
- Files: NEW `features/technicianApp/stepperModel.ts`, `features/technicianApp/components/WorkflowStepper.tsx`; MODIFY `features/technicianApp/TechJobDetailScreen.tsx`, `features/technicianApp/index.ts`; tests.
- [Source: api-contracts.md §1, §4, §7; fenzit-be workflow.service.ts STEP_ORDER + validateStep (mirror its skip rule EXACTLY); 1-2 components].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
