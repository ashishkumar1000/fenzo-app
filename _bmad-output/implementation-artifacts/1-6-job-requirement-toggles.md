---
baseline_commit: af01f7a4e091ff79ceae3830723cfb33d8dbce6e
---

# Story 1.6: Job Requirement Toggles (photos + signature)

Status: ready-for-dev

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

- [ ] **Task 1 — Types** (`src/services/resources/jobs.ts`):
  - [ ] `CreateJobRequest`: add `requireCompletionSignature?: boolean` (sibling of :80).
  - [ ] `UpdateJobEditFields` (:99-108): add `requireCompletionPhoto?: boolean` and
        `requireCompletionSignature?: boolean`.
  - [ ] `ApiJob` (:118-156): add `requireCompletionSignature: boolean` (required, sibling of
        :149) — shared with Story 3-5 Task 2; whoever lands first updates the five fixtures
        (`workflowActionBarModel.test.ts:30`, `WorkflowStepper.test.tsx:26`, `jobs.test.ts:32`,
        `editJobModel.test.ts:32`, plus any new fixture) per 3-5 AC 8.
  - [ ] Update `fenzo-app/_bmad-output/planning-artifacts/api-contracts.md` §5 (create body),
        §6 (PATCH subset), §2 (`ApiJob`).
- [ ] **Task 2 — NewJobScreen** (`src/features/newJob/`):
  - [ ] `types.ts`: `NewJobDraft` gains `requireCompletionPhoto: boolean` +
        `requireCompletionSignature: boolean` (init `false` in `initialDraft()` —
        `NewJobScreen.tsx:68-74`).
  - [ ] `NewJobScreen.tsx`: new section after Notes (before ScrollView close, :484-491) with
        two `Switch` rows wired through `patch()` (:173-174); create call (:216-233) passes
        both flags and updates the :231-232 comment (priority remains omitted).
- [ ] **Task 3 — Edit sheet** (`src/features/jobDetail/`):
  - [ ] `editJobModel.ts`: `EditJobDraft` (:22-29) gains both flags; seeding in
        `EditJobSheet.tsx:107-141`; `buildPatch` (:59-91) diffs them (send only when changed —
        mirror the priority field's diff pattern).
  - [ ] `EditJobSheet.tsx`: two `Switch` rows (new "Job requirements" section — the sheet's
        section pattern matches the Priority pill row styling at :263-290 for spacing/titles;
        use `Switch`, not pills).
- [ ] **Task 4 — Tests**: `editJobModel.test.ts` (defaults, buildPatch diff, flags-only patch
      non-empty, mixed patch merges flags with other fields); `jobs.test.ts` create payload
      includes the new flag; update stale fixtures per Task 1 if this story lands the `ApiJob`
      field first.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log