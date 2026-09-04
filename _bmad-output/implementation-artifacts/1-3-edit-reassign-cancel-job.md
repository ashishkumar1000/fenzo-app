---
baseline_commit: 3cbf678ec7dcdab1ce3ec845a828de46e60a4513
---

# Story 1.3: Edit, Reassign & Cancel Job

Status: done

## Story

As an owner,
I want to fix details, change the assigned technician, or cancel a scheduled job,
so that the board stays accurate when plans change.

## API Contract (api-contracts.md §6 — read it in full before coding)

`PATCH /jobs/:id`. Body: subset of `{ description, scheduledStart, scheduledEnd, notesForTechnician, technicianId, priority }` OR exactly `{ status: 'cancelled' }`. Server rules the FE MUST respect: (a) cancel + edit fields together → 422; (b) empty patch → 422; (c) inverted schedule window → 422 (server also checks one-sided edits against the STORED bound via PT422); (d) `null` means "unchanged" — fields cannot be cleared. 200 → full `ApiJob`. 409 `JOB_NOT_MODIFIABLE` when not `scheduled`. 404 job/technician. 403 technician JWT.

## UI Design (ui-design-spec.md §5)

Actions slot (scheduled only): row gap s3 — Button secondary md flex-1 "Edit job" + Button ghost md "Cancel job" with `colors.danger` label (destructive-text pattern, matching MoreScreen's red logout row; NOT the solid danger variant). EditJobSheet uses the established sheet chrome (scrim, radius.xl top, grabber, KeyboardAvoidingView): title "Edit job", subtitle "Only scheduled jobs can be edited.", form gap s4 in order Description (multiline) → Schedule (DateTimeFields) → Notes for technician (multiline) → Priority as two side-by-side pills ("Normal"/"Urgent"; selected = primarySoft bg + primary border + primary labelStrong, height ≥ touch.min) → TechnicianPicker rows (Avatar + name + skills caption + trailing check when selected). Footer: Button primary lg fullWidth "Save changes" (loading; disabled when diff empty); inline bodySm danger error above it. Cancel = native Alert per spec §5. Copy from spec §15.

## Acceptance Criteria

1. **Given** `detail.status === 'scheduled'`, **then** the actions slot in JobDetail renders an Edit button (secondary) and a Cancel job button (destructive text style); any other status renders nothing in the slot.
2. **Given** the Edit sheet open, **then** it is prefilled from the loaded detail: description (Input, multiline), schedule (reuse `DateTimeFields` from features/newJob/components), notes for technician (Input, multiline), priority (two-option control: Normal / Urgent), technician (shared `TechnicianPicker` fed from `useMyProfile().profile.technicians` — server ids only).
3. **Given** Save, **then** ONLY changed fields are sent (diff each field against the loaded detail; unchanged/absent fields omitted); no-change → Save disabled; success (200) → sheet closes, screen state replaces with the response merged over the existing detail (technician/customer/log/attachments retained until refetch), `upsertJob(response)` updates the list store, `loadMyProfile()` fires (counts).
4. **Given** a one-sided schedule edit, **then** the FE pre-validates against the OTHER stored bound (new end < stored start, or new start > stored end → inline "End time can't be before start time") before any request.
5. **Given** Cancel job tap, **then** `Alert.alert('Cancel job', 'The technician will no longer see this job.', [Keep job (cancel style), Cancel job (destructive)])`; confirm sends EXACTLY `{ status: 'cancelled' }`; success → Cancelled badge, actions slot empties, list + counts refresh.
6. **Given** a 409 (`ApiError.code === 'JOB_NOT_MODIFIABLE'`), **then** show "This job has already started and can't be changed", close the sheet, refetch the detail.
7. **Given** a 404 on save with `technicianId` in the diff, **then** inline error "That technician is no longer available" inside the sheet + `loadMyProfile()` refreshes the roster; **given** a 422, **then** the `ApiError.message` renders inline in the sheet (message may arrive as an array — display `Array.isArray(m) ? m.join('. ') : m` locally until Story 5.4 centralizes it).

## Tasks / Subtasks

- [x] **Task 1 — Service** (`services/resources/jobs.ts`): `interface UpdateJobRequest { description?: string; scheduledStart?: string; scheduledEnd?: string; notesForTechnician?: string; technicianId?: string; priority?: JobPriority; status?: 'cancelled' }` + `async function update(id: string, patch: UpdateJobRequest): Promise<ApiJob> { const res = await apiClient.patch<ApiJob>(`/jobs/${id}`, patch); return res.data; }`; add to `jobService` + barrel.
- [x] **Task 2 — TechnicianPicker extraction**: move/generalize `features/newJob/components/TechnicianPicker.tsx` so both NewJob and the Edit sheet consume one component with props `{ technicians: ProfileTechnician[]; selectedId: string | null; onSelect(id: string): void }` — adjust NewJobScreen imports; zero visual change there.
- [x] **Task 3 — Edit sheet** (`features/jobDetail/components/EditJobSheet.tsx`, new): Modal bottom-sheet copying AddTechnicianSheet's chrome (grabber, rounded top, KeyboardAvoidingView); props `{ visible, job: JobDetail, technicians, onClose, onSaved(job: ApiJob) }`; internal form state initialized from `job`; `buildPatch()` diff helper returning `UpdateJobRequest | null`:
  ```ts
  const changed = <K extends keyof UpdateJobRequest>(key: K, next: unknown, prev: unknown) => (next !== prev && next !== '' ? { [key]: next } : {});
  // assemble from description/scheduledStart/scheduledEnd/notes/technicianId/priority; return null when empty
  ```
  Save handler: pre-validate schedule (AC 4) → `jobService.update` → onSaved; error branches per AC 6/7.
- [x] **Task 4 — Cancel flow** (`JobDetailScreen`): destructive action + Alert per AC 5; on success merge `{...detail, ...response}` and clear the sheet state.
- [x] **Task 5 — Actions slot wiring** (`JobDetailScreen`): render buttons only when `detail.status === 'scheduled'`; open/close sheet state; after ANY successful mutation also fire `loadMyProfile()` (Story 1.4 contract).
- [x] **Task 6 — Tests**: `buildPatch` (no-change → null; each field individually; date normalization to ISO); one-sided inversion pre-check both directions; 409 branch closes sheet + triggers refetch (mock service).

## Dev Notes

- NEVER combine `status: 'cancelled'` with other fields in one request (server 422s it) — cancel is its own code path.
- `DateTimeFields` emits Dates — convert with `.toISOString()` before diffing (the loaded detail's strings are ISO UTC; compare ISO-to-ISO).
- Clearing a field is impossible by API design (E1). Empty string in an input that HAD a value = keep prior value and omit from patch (document with an inline comment).
- After reassign, the refetched activity log will show `job_reassigned` — good manual verification.
- Files: NEW `features/jobDetail/components/EditJobSheet.tsx`; MODIFY `services/resources/jobs.ts` + barrel, `features/jobDetail/JobDetailScreen.tsx`, `features/newJob/components/TechnicianPicker.tsx` (+ NewJobScreen import), tests.
- [Source: api-contracts.md §6; fenzit-be src/jobs/jobs.service.ts#updateJob L324–481; fenzit-be deferred-work E1/CR1; features/technicians/components/AddTechnicianSheet.tsx (sheet chrome)].

## Dev Agent Record

### Agent Model Used

Claude Code (GLM 5.3 Flash, cloud)

### Debug Log References

- Watchman is sandbox-blocked in this environment → all jest runs used `bunx jest --watchman=false`.
- Two `buildPatch` red-phase failures (emptied description/notes sent as `""`) fixed by routing text fields through `textChanged` — an emptied field must be omitted (API cannot clear, E1).
- `bunx tsc --noEmit` errors fixed during the run: EditJobSheet import path, `as const` widening in model tests, then clean.
- `bun run lint` fails pre-existing: "ESLint couldn't find a configuration file" — repo has no eslint config; not touched by this story.
- New component test (`__tests__/edit-job-sheet.test.tsx`) needed a few adjustments to work under the RN jest preset: RN's `Modal` stub renders nothing in `toJSON` but children DO mount in the instance tree (no workaround needed); text lives in nested Text hosts, so helpers walk raw string children instead of matching `node.type === Text` with string children; tree instances' `type` doesn't strictly equal the imported `Pressable` (matched by displayName instead); TextInput content asserted via `props.value`. Also: `create()` must be wrapped in `act()` (the open-sheet seeding effect commits on mount).

### Completion Notes List

- TechnicianPicker generalized with a `variant?: 'tiles' | 'rows'` prop (spec ambiguity: §5 describes a rows layout in the sheet while Task 2 demands zero visual change in NewJob) — `tiles` (default) preserves NewJobScreen exactly; `rows` is the sheet's vertical layout with a trailing check.
- UI edits the start only (DateTimeFields in the sheet is a single start editor); `scheduleWindowError` is still a pure function covering BOTH one-sided directions (AC 4) and is unit-tested — the "end pulled before stored start" direction guards future end-field editors and server-parity tests.
- AC 6 coordination: the sheet shows the started-job message for 1500 ms (`CLOSE_DELAY_MS`, timer cleaned up on unmount), then calls `onClose`; the parent's close handler does the silent `load(false)` refetch. Unit-tested with fake timers.
- API error messages may arrive as arrays (class-validator) — flattened with `Array.isArray(m) ? m.join('. ') : m` in `resolveSaveError`, per AC 7, until Story 5.4 centralizes it.
- Reassign uses only server ids from `useMyProfile().profile.technicians`; deselecting a technician omits `technicianId` from the patch (cannot clear, E1) — the prior technician stays.
- Date diffs compare instants via `getTime()`, so a stored `…:00Z` never false-diffs against `…:00.000Z` from `toISOString()`.
- Red-green: 19 model tests written first (RED against missing modules), then GREEN. Full suite: 12 suites / 105 tests passing; `bunx tsc --noEmit` clean.
- Frontend-only change — no deploy ordering vs fenzit-be (the PATCH contract already ships in the backend).

### File List

- NEW `src/features/jobDetail/editJobModel.ts` — buildPatch diff, scheduleWindowError pre-validation, resolveSaveError classification, copy constants.
- NEW `src/features/jobDetail/editJobModel.test.ts` — 19 unit tests (patch diff, schedule window both directions, error mapping incl. array-flattened 422).
- NEW `src/features/jobDetail/components/EditJobSheet.tsx` — bottom-sheet edit/reassign form (AddTechnicianSheet chrome; DateTimeFields + TechnicianPicker; save flow with error branches).
- NEW `src/components/TechnicianPicker.tsx` — shared picker extracted from newJob (variants: tiles = NewJob visuals, rows = sheet layout).
- NEW `__tests__/edit-job-sheet.test.tsx` — component tests: prefilled form + Save disabled, diff-only save on success, 409 close-after-delay branch, 404 reassign branch (roster refresh, no close), 422 inline message.
- MODIFIED `src/services/resources/jobs.ts` — `UpdateJobRequest` + `jobService.update` (PATCH /jobs/:id).
- MODIFIED `src/services/resources/index.ts` — export `UpdateJobRequest`.
- MODIFIED `src/components/ui/Button.tsx` — optional `labelColor` prop (destructive-text pattern).
- MODIFIED `src/features/jobDetail/JobDetailScreen.tsx` — actions slot (Edit/Cancel for scheduled), cancel flow with Alert, edit sheet wiring, `applyJobUpdate` merge + `upsertJob` + `loadMyProfile`, silent refetch on sheet close.
- MODIFIED `src/features/newJob/NewJobScreen.tsx` — consumes shared TechnicianPicker (zero visual change).
- MODIFIED `src/features/newJob/types.ts`, `src/features/newJob/index.ts` — removed the now-unused local `TechnicianOption` type / barrel cleanup.
- DELETED `src/features/newJob/components/TechnicianPicker.tsx` — replaced by the shared component.

## Change Log

- 2026-09-04 — Story 1-3 implemented (dev): PATCH service method, shared TechnicianPicker (tiles/rows), EditJobSheet with diff-based save + schedule pre-validation + 409/404/422 handling, cancel flow via native Alert, actions slot for scheduled jobs; 24 new tests, suite green (105 tests).
- 2026-09-04 — Story 1-3 code review: 5 decisions resolved, 14 patch findings applied (cancel failure alert + in-flight guard, 409 auto-close hardening, re-seed race fix, empty-roster copy split, error-message fallback, past-slot guard, discriminated-union UpdateJobRequest, bodySm subtitle, hint copy, invited-technician filter, trailing newlines). Test suite grown to 126 tests across 13 suites (all passing), tsc clean. 3 findings deferred to deferred-work.md. User-reported HomeScreen crash deliberately left for a follow-up fix after commit.

### Review Findings

#### Decision-needed

- [x] [Review][Decision] Edit sheet has no end-time field — AC4's "new end < stored start" pre-check is unreachable from the UI — Detail: sheet edits only the start (DateTimeFields is start-only); `scheduledEnd` is never emitted and the end-direction of `scheduleWindowError` is dead in the live UI (unit-tested only). Contract supports editing both. Decide: add an end-time field to the sheet, or keep start-only editing (then trim the story/AC note). **RESOLVED: keep start-only editing** — `scheduledEnd` is often null in stored data, so an end field would mostly render empty; end-editing is still server-supported for a future story, and the two-direction pre-check stays as tested server parity.
- [x] [Review][Decision] Destructive-intent actions are silent no-ops in the sheet — emptied Description/Notes or deselecting the technician produce a null patch and Save just stays disabled with no copy. The API cannot clear fields (E1), but nothing tells the user. Decide: inline hint copy ("Fields can't be cleared — edit the text instead"), disable the selected technician row, or leave as-is. **RESOLVED: one-line hint above Save** — "Emptied fields keep their saved value, and the assigned technician stays until you pick another one." (asserted in the sheet test).
- [x] [Review][Decision] Divergent invited-technician rules between variants — Tiles (NewJob) shows an "Invited" chip; Rows (edit sheet) shows neither the chip nor filters invited technicians, so the two surfaces treat not-yet-installed technicians differently. Decide: filter invited in the sheet, show the marker in rows too, or leave. **RESOLVED: filter invited in the edit sheet** — invited technicians can't take work, so they don't belong in a reassign list; the tiles variant keeps its "Invited" marker.
- [x] [Review][Decision] Stale technician card after reassign — `applyJobUpdate` merges `{...prev, ...updated}`; the response has no `technician` relation, so the old technician stays on screen until the silent refetch (and indefinitely if that refetch fails). Decide: accept the transient (normal case ~1s) or clear the relation on technicianId change. **RESOLVED: accept the ~1s transient** — the silent refetch normally corrects it immediately; clearing the relation would render a "no technician" state that is itself wrong.
- [x] [Review][Decision] 404 on save blames the technician for any 404 — if the job itself was deleted, the user sees "That technician is no longer available" + roster refresh, and the sheet stays open on a dead job. The server cannot distinguish the two 404s. Decide: accept the heuristic or close the sheet on any 404. **RESOLVED: accept the heuristic** — the server cannot distinguish the two 404s, and closing the sheet on a deleted job would just dump the user onto an equally stale screen.

#### Patch

- [x] [Review][Patch] Cancel failure is invisible — non-409 failures only `console.warn`; user gets no feedback after confirming [src/features/jobDetail/JobDetailScreen.tsx:208] **APPLIED:** non-409 cancel failures now `Alert.alert("Couldn't cancel the job", …)` with the flattened API message (covered by screen test).
- [x] [Review][Patch] Cancel has no in-flight guard — double-tap fires two PATCHes [src/features/jobDetail/JobDetailScreen.tsx:211] **APPLIED:** `isCancellingRef` guards a second PATCH while one is in flight.
- [x] [Review][Patch] 409 close window: Save re-enabled and backdrop live during the 1.5s delay; close timer not cleared on a second failure → possible double onClose/refetch [src/features/jobDetail/components/EditJobSheet.tsx:130] **APPLIED:** `isAutoClosing` state blocks Save and backdrop during the 1500ms countdown; the timer is cleared before re-scheduling and on fire (sheet test asserts a second press sends nothing and onClose fires exactly once).
- [x] [Review][Patch] Re-seed race — a background refetch landing after a quick reopen wipes in-progress edits (effect keyed on `[visible, job]`) [src/features/jobDetail/components/EditJobSheet.tsx:78] **APPLIED:** re-seed now keyed on a `wasVisibleRef` false→true transition only — a refetch landing while the sheet is open can no longer wipe in-progress edits (regression test added).
- [x] [Review][Patch] Roster-not-ready renders as "No technician matches that name." — distinguish empty roster from no search match [src/components/TechnicianPicker.tsx] **APPLIED:** empty roster renders "No technicians added yet."; a no-match search renders "No technician matches that name." (new TechnicianPicker test file, 6 tests).
- [x] [Review][Patch] Error fallthrough can render raw network text or an empty string (no feedback) — friendly fallback needed [src/features/jobDetail/editJobModel.ts:118] **APPLIED:** `resolveSaveError` fallthrough flattens array messages and falls back to `SAVE_FAILED_MESSAGE` when nothing usable arrives.
- [x] [Review][Patch] Edit sheet accepts a past scheduled start — NewJob blocks past slots (minimumDate + isPastSlot), edit flow doesn't [src/features/jobDetail/components/EditJobSheet.tsx:112] **APPLIED:** `pastSlotError(patch)` in the model blocks a past new start with NewJob's "Pick a time in the future." copy (model + model tests).
- [x] [Review][Patch] No screen-level tests for actions slot, cancel payload, post-mutation wiring (regression demonstrated: cancel sending wrong status passes all 105 tests) [__tests__/job-detail-screen.test.tsx] **APPLIED:** 5 new JobDetailScreen tests — actions slot for scheduled-only, no actions otherwise, cancel PATCH payload `{ status: "cancelled" }` + profile refresh + refetch, failure alert, 409-refetch-no-alert.
- [x] [Review][Patch] `jobService.update` wire path untested — switching PATCH→POST passes the whole suite (demonstrated) [__tests__/jobs-service.test.ts] **APPLIED:** 2 new jobs-service tests pin the PATCH verb/URL and both payload variants (cancel verbatim, edit-fields-only).
- [x] [Review][Patch] Tiles variant + "Invited" marker untested — extraction regression risk for NewJob screen [__tests__/] **APPLIED:** new `__tests__/technician-picker.test.tsx` (6 tests) covers tiles, rows, deselect, search and both empty states.
- [x] [Review][Patch] Screen test services mock lacks `usersApi` (profile load error noise every run) and header comment claims actions-slot coverage that doesn't exist [__tests__/job-detail-screen.test.tsx:27] **APPLIED:** screen test mocks the profile feature whole (`loadMyProfile`, `formatPhone`) and the header comment now matches actual coverage.
- [x] [Review][Patch] `UpdateJobRequest` flat interface allows `{ status: 'cancelled', ...fields }` (server 422s it) — use a discriminated union [src/services/resources/jobs.ts:80] **APPLIED:** `UpdateJobRequest` is now `UpdateJobEditFields | { status: 'cancelled' }` — mixing cancel with edit fields is a type error; model guards narrow with `'status' in patch`.
- [x] [Review][Patch] Five new files missing a trailing newline [editJobModel.ts, editJobModel.test.ts, EditJobSheet.tsx, TechnicianPicker.tsx, edit-job-sheet.test.tsx] **APPLIED:** all five files end with a newline (verified with `od -c`).
- [x] [Review][Patch] Sheet subtitle uses `typography.body` — §5 specifies bodySm muted [src/features/jobDetail/components/EditJobSheet.tsx:298] **APPLIED:** subtitle and hint now use `typography.bodySm` in the muted text color.
- [ ] [Review][Patch] USER-REPORTED (fix after review + commit): HomeScreen render crash "Cannot read property 'scheduled' of undefined" — `profile.jobStatusCounts` undefined on the /users/me payload [src/screens/HomeScreen.tsx:104]

#### Deferred

- [x] [Review][Defer] Zero-length schedule window (end == start) parity with server unverified — deferred, needs backend rule confirmation
- [x] [Review][Defer] `ApiError.message` typed as string but can arrive as an array — deferred, Story 5.4 centralizes error handling
- [x] [Review][Defer] No e2e/testID/accessibility hooks on the new sheet controls — deferred, not in story scope
