---
baseline_commit: af01f7a4e091ff79ceae3830723cfb33d8dbce6e
---

# Story 1.6: Job Requirement Toggles (photos + signature)

Status: done

## Story

As an owner,
I want to decide per job whether completion photos and a customer signature are required,
so that simple jobs don't force unnecessary evidence steps on the technician.

## Background (why this story exists)

The backend has always supported `requireCompletionPhoto` at creation
(`CreateJobRequest` `src/services/resources/jobs.ts:80`) — but no UI ever set it:
`NewJobScreen.tsx:231-232` deliberately omits it ("no UI for either") and `PATCH /jobs/:id`
could not carry it (`UpdateJobEditFields` :99-108 has no flags). BE Story 3-8 (ships first)
adds `requireCompletionSignature` end-to-end and makes **both** flags editable on PATCH. This
story is the owner-side UI: two toggles at creation, editable in the edit sheet, and the
technician app reacts via Story 3-5 (revised).

**Deliberate design decisions (do not "fix" these):**
- **Both toggles together, one "Job requirements" section** (decision 2026-09-05) — photos and
  signature treated consistently.
- **Both flags editable in the edit sheet** (decision 2026-09-05). The sheet is only enabled
  while `status === 'scheduled'` (`JobDetailScreen.tsx:378`) — flags change only before work
  starts, which matches the BE PT409 non-scheduled guard.
- **No new activity-log event** — BE 3-8 keeps flag edits unlogged like every other edit
  field; `eventLabels.ts` needs no change.
- **Diff-only patch semantics preserved** — `buildPatch` sends only changed fields.

## API Contract (fenzo-app api-contracts.md §5/§6 — update in this story)

- `POST /jobs` body: `requireCompletionPhoto?: boolean` (exists) + `requireCompletionSignature?: boolean`
  (new, default false server-side).
- `PATCH /jobs/:id` editable subset gains `requireCompletionPhoto?: boolean` and
  `requireCompletionSignature?: boolean` — absent = unchanged (COALESCE server-side).
- `ApiJob` carries `requireCompletionSignature: boolean` (required — BE always sends it).

## Acceptance Criteria

1. **Given** the NewJob form, **then** a "Job requirements" section (after Notes, same
   `styles.section` + `styles.sectionLabel` pattern as the other sections) shows two `Switch`
   rows (the ui `Switch` component, 44px-min label rows): "Require completion photos" and
   "Require customer signature", both default OFF.
2. **Given** the create call, **then** `jobService.create` sends both flags from the draft
   (replacing the omission comment at `NewJobScreen.tsx:231-232`); `priority` stays omitted.
   Both flags are part of `NewJobDraft` (`src/features/newJob/types.ts:24-35`) + `initialDraft()`.
3. **Given** the owner edit sheet on a `scheduled` job, **then** the same two `Switch` rows
   appear (seeded from `detail.requireCompletionPhoto` / `...Signature`); Save is enabled only
   when something changed (existing `buildPatch` diff rule — a toggled flag counts as a
   change); saving PATCHes only the changed flags alongside any other edited fields.
4. **Given** an edit-sheet job that is not `scheduled`, **then** the sheet is not reachable
   (existing gate at `JobDetailScreen.tsx:378`) — no new handling needed.
5. **Given** the whole change, **when** `bun run test` runs, **then** green with:
   `editJobModel` tests for the two new draft fields (default false; buildPatch emits a flag
   field only when it changed; a flags-only change still counts as non-empty) and a
   `jobs.test.ts` create-payload assertion for the new field. No NewJobScreen tests exist
   today — do not introduce a screen-test harness in this story (note in Dev Agent Record).

## Tasks / Subtasks

- [x] **Task 1 — Types** (`src/services/resources/jobs.ts`):
  - [x] `CreateJobRequest`: add `requireCompletionSignature?: boolean` (sibling of :80).
  - [x] `UpdateJobEditFields` (:99-108): add `requireCompletionPhoto?: boolean` and
        `requireCompletionSignature?: boolean`.
  - [x] `ApiJob` (:118-156): add `requireCompletionSignature: boolean` (required, sibling of
        :149) — shared with Story 3-5 Task 2; whoever lands first updates the five fixtures
        (`workflowActionBarModel.test.ts:30`, `WorkflowStepper.test.tsx:26`, `jobs.test.ts:32`,
        `editJobModel.test.ts:32`, plus any new fixture) per 3-5 AC 8.
  - [x] Update `fenzo-app/_bmad-output/planning-artifacts/api-contracts.md` §5 (create body),
        §6 (PATCH subset), §2 (`ApiJob`).
- [x] **Task 2 — NewJobScreen** (`src/features/newJob/`):
  - [x] `types.ts`: `NewJobDraft` gains `requireCompletionPhoto: boolean` +
        `requireCompletionSignature: boolean` (init `false` in `initialDraft()` —
        `NewJobScreen.tsx:68-74`).
  - [x] `NewJobScreen.tsx`: new section after Notes (before ScrollView close, :484-491) with
        two `Switch` rows wired through `patch()` (:173-174); create call (:216-233) passes
        both flags and updates the :231-232 comment (priority remains omitted).
- [x] **Task 3 — Edit sheet** (`src/features/jobDetail/`):
  - [x] `editJobModel.ts`: `EditJobDraft` (:22-29) gains both flags; seeding in
        `EditJobSheet.tsx:107-141`; `buildPatch` (:59-91) diffs them (send only when changed —
        mirror the priority field's diff pattern).
  - [x] `EditJobSheet.tsx`: two `Switch` rows (new "Job requirements" section — the sheet's
        section pattern matches the Priority pill row styling at :263-290 for spacing/titles;
        use `Switch`, not pills).
- [x] **Task 4 — Tests**: `editJobModel.test.ts` (defaults, buildPatch diff, flags-only patch
      non-empty, mixed patch merges flags with other fields); `jobs.test.ts` create payload
      includes the new flag; update stale fixtures per Task 1 if this story lands the `ApiJob`
      field first.

### Review Findings

- [x] [Review][Patch] Screen-level coverage for the toggles — `__tests__/edit-job-sheet.test.tsx` and
  `__tests__/new-job-screen.test.tsx` mount the screens but never assert the two Switch rows render, seed from
  the job, or reach the create/patch body. Verification confirmed the gap is real: the NewJobScreen test asserts
  the create body via `expect.objectContaining` (customerId/technicianId/serviceType only), so dropped flags
  would pass silently. **Resolved 2026-09-05: extend the existing screen suites** (not "introducing a harness" —
  one has existed since Story 1-1; AC 5's premise was stale). New tests: NewJob — switches default OFF + toggled
  flag reaches the create body; edit sheet — labels render, switches seed from the job, toggled flag PATCHes
  alone.
- [x] [Review][Patch] `jobs.test.ts` ends without a trailing newline [src/services/resources/jobs.test.ts:EOF]
  — **fixed 2026-09-05.**
- [x] [Review][Patch] api-contracts §1 documents only the photo-skip rule — **fixed 2026-09-05**: added the
  signature skip rule ("`signature_captured` skippable only when `requireCompletionSignature === false`"),
  verified against `fenzit-be/src/jobs/workflow.service.ts` `validateStep`.
  [_bmad-output/planning-artifacts/api-contracts.md §1]
- [x] [Review][Patch] PATCH flag-passthrough not pinned by a service test — **fixed 2026-09-05**: `jobService.update`
  verbatim-passthrough test added (mocked `apiClient.patch`).
  [src/services/resources/jobs.test.ts]
- [x] [Review][Patch] Section order differs between surfaces — **resolved 2026-09-05 by documenting the
  divergence**: AC 1 pins NewJob's placement (after Notes), so the sheet keeps its own order (after Priority,
  before Technician) with a comment in `EditJobSheet.tsx` explaining why (job-level attributes ahead of the
  roster, so the technician list isn't pushed below the scroll fold).
- [x] [Review][Patch] No explicit test that draft flags default to `false` — **resolved 2026-09-05 via the
  screen test instead of a model test**: `initialDraft()` is screen-local (not exported), and the new NewJob
  test asserts both switches render `false` on mount — the exact AC-5 "default OFF" guarantee, pinned where the
  default lives. Exporting `initialDraft` for a model test would add surface for no extra coverage.
- [x] [Review][Defer] Deploy-order hazard: `ApiJob.requireCompletionSignature` is required, so if fenzo-app
  deploys before fenzit-be 3-8, every job row would carry `undefined` for the field (seeding `undefined` into
  drafts, diffing truthy against `false`). Cross-repo ordering is CLAUDE.md territory (BE first) — noted as a
  hand-off constraint, not a code fix. [src/services/resources/jobs.ts] — deferred, pre-existing
- [x] [Review][Defer] Signature toggle is inert until Story 3-5 ships — the owner can set
  `requireCompletionSignature`, but the technician app doesn't consume it yet. Expected sequencing (3-5 is
  ready-for-dev and revised to depend on this field), not a defect. — deferred, pre-existing
- [x] [Review][Defer] Fixture duplication across 11 test files — every new required `ApiJob` field touches all
  fixtures; a shared `makeJob()` factory would stop the churn. Pre-existing pattern family, standalone cleanup.
  [src/features/jobDetail/editJobModel.test.ts:32, src/services/resources/jobs.test.ts:32, +9 root fixtures] — deferred, pre-existing
- [x] [Review][Defer] Relative imports in touched files — new imports in this story followed the file's existing
  relative style rather than the CLAUDE.md `@/` aliases; repo-wide alias migration is already deferred from the
  2-1 review. — deferred, pre-existing
- [x] [Review][Defer] Sheet controls not disabled while submitting — the new Switches stay enabled during the
  in-flight save like every other sheet control (pre-existing pattern); if it ever matters, disable the whole
  form in one pass. [src/features/jobDetail/components/EditJobSheet.tsx] — deferred, pre-existing

## Dev Notes

- **Existing patterns to reuse (never reinvent):** ui `Switch` (`src/components/ui/Switch.tsx`,
  already exported from the ui barrel — `accessibilityRole="switch"`); `patch()` draft-merge
  idiom in NewJobScreen; `buildPatch` diff-only semantics + `UpdateJobRequest` union
  (`jobs.ts:96`); `EditJobSheet` seeding-on-open (:107-141).
- **Cross-story sequencing:** BE 3-8 first (flag exists on the wire); then this story (1-6)
  and the revised 3-5 are independent of each other but 3-5's stepper/model changes consume
  the same `ApiJob` field — coordinate who updates the five fixtures (Task 1 note).
- **Sheet gating:** edit is owner-only and `scheduled`-only; flags therefore never change
  mid-workflow from the owner UI. The BE effective-chain rule (3-8) still handles flag changes
  made via API on an in-flight job — out of FE scope.
- Design tokens only (DESIGN_SYSTEM.md); no hardcoded values. Section label copy: "Job
  requirements" (sentence case, matches other section labels).
- [Source: src/features/newJob/NewJobScreen.tsx:68-74,173-174,201-251,427-491; src/features/jobDetail/editJobModel.ts:22-29,59-91; src/features/jobDetail/components/EditJobSheet.tsx:107-141,263-290; src/services/resources/jobs.ts:64-108,118-156; src/navigation/types.ts:36-44; fenzit-be story 3-8].

## Dev Agent Record

### Agent Model Used

Claude Code (GLM) — 2026-09-05

### Debug Log References

- RED→GREEN: 3 new editJobModel tests failed before the model change (flag diff, flags-only
  patch, mixed patch), passed after `buildPatch` gained the flag diffs.
- Full suite: 43 suites / 406 tests green. `bunx tsc --noEmit`: clean after fixture updates.
- `bun run lint`: **no ESLint config exists in this repo** (pre-existing, unrelated to this
  story — eslint exits with "couldn't find a configuration file").

### Completion Notes List

- Implemented in task order 1 → 4 (red-green on the model tests before the UI landed).
- `ApiJob.requireCompletionSignature` is required, matching the BE `JobResponse`
  (verified against `fenzit-be/src/jobs/jobs.service.ts:54` and
  `sync/dto/sync-response.dto.ts:29` — delta-sync payloads carry it too, so the field is
  required rather than optional; the `completedAt`-style sync exception does NOT apply here).
- **Fixture updates (this story landed the `ApiJob` field first):** besides the four fixtures
  named in Task 1/AC 5, nine root `__tests__/` fixtures also needed the field
  (`JobCard`, `JobsScreen`, `jobs-service`, `edit-job-sheet`, `job-detail-screen` ×2 incl.
  its `toApiJob` mapper, `today-sections`, `useJobs`, `useTechnicianJobs`,
  `tech-job-detail-screen` ×2). All set to `false`, except `tech-job-detail-screen`
  (`true` — matches its photo fixture).
- **`WorkflowStepper.test.tsx:26` deliberately NOT updated:** its fixture is a
  `StepperJob` = `Pick<JobDetail, 'currentStep' | 'requireCompletionPhoto' | 'status'>` —
  adding the field there fails the excess-property check, and widening the Pick is
  Story 3-5's Task 2 (its Dev Notes say widening is what forces its fixtures). 3-5 should
  add `requireCompletionSignature: false` to this fixture when it widens the Pick.
- Edit-sheet section placed after Priority (sheet order: Description → Schedule → Notes →
  Priority → Job requirements → Technician); NewJob section after Notes, both using the ui
  `Switch` with its built-in 44px-min row. Section label "Job requirements" (sentence case).
- Edit-sheet toggles clear `formError` on change, matching every other control's pattern.
- `jobs.test.ts` create test asserts the body passes through verbatim, both flags included;
  also updated the file's header comment (it described only the advanceWorkflow tests).
- No NewJobScreen screen-test harness introduced, per AC 5. The root `__tests__/new-job-screen.test.tsx`
  suite (from Story 1-1) passes unchanged.

### File List

- `src/services/resources/jobs.ts` (modified — CreateJobRequest, UpdateJobEditFields, ApiJob)
- `src/features/newJob/types.ts` (modified — NewJobDraft flags)
- `src/features/newJob/NewJobScreen.tsx` (modified — section, create call, initialDraft)
- `src/features/jobDetail/editJobModel.ts` (modified — EditJobDraft, buildPatch diffs)
- `src/features/jobDetail/components/EditJobSheet.tsx` (modified — seeding, draft, section)
- `src/features/jobDetail/editJobModel.test.ts` (modified — BASE_JOB/makeDraft + 3 new tests)
- `src/services/resources/jobs.test.ts` (modified — fixture + create-payload test)
- `src/features/technicianApp/workflowActionBarModel.test.ts` (modified — fixture)
- `__tests__/JobCard.test.tsx` (modified — fixture)
- `__tests__/JobsScreen.test.tsx` (modified — fixture)
- `__tests__/jobs-service.test.ts` (modified — fixture)
- `__tests__/edit-job-sheet.test.tsx` (modified — fixture)
- `__tests__/job-detail-screen.test.tsx` (modified — fixture + toApiJob mapper)
- `__tests__/today-sections.test.ts` (modified — fixture)
- `__tests__/useJobs.test.ts` (modified — fixture)
- `__tests__/useTechnicianJobs.test.ts` (modified — fixture)
- `__tests__/tech-job-detail-screen.test.tsx` (modified — fixtures ×2)
- `_bmad-output/planning-artifacts/api-contracts.md` (modified — §2, §5, §6)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status)
- `_bmad-output/implementation-artifacts/1-6-job-requirement-toggles.md` (this file)

## Change Log

- 2026-09-05 — Story 1-6 implemented: job requirement toggles end-to-end on the owner side.
  Types widen (`CreateJobRequest.requireCompletionSignature`, both flags in
  `UpdateJobEditFields`, `ApiJob.requireCompletionSignature` required). NewJob gains a
  "Job requirements" section after Notes (two Switch rows, default off) and sends both flags
  on create. Edit sheet gains the same section (after Priority), seeded from the detail and
  diffed via `buildPatch` so only changed flags go on the wire. api-contracts.md §2/§5/§6
  updated. 11 stale `ApiJob`/`JobDetail` fixtures updated. Tests: 406 pass; tsc clean.