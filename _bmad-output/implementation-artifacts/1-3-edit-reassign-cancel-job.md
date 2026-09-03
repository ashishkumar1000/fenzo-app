# Story 1.3: Edit, Reassign & Cancel Job

Status: ready-for-dev

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

- [ ] **Task 1 — Service** (`services/resources/jobs.ts`): `interface UpdateJobRequest { description?: string; scheduledStart?: string; scheduledEnd?: string; notesForTechnician?: string; technicianId?: string; priority?: JobPriority; status?: 'cancelled' }` + `async function update(id: string, patch: UpdateJobRequest): Promise<ApiJob> { const res = await apiClient.patch<ApiJob>(`/jobs/${id}`, patch); return res.data; }`; add to `jobService` + barrel.
- [ ] **Task 2 — TechnicianPicker extraction**: move/generalize `features/newJob/components/TechnicianPicker.tsx` so both NewJob and the Edit sheet consume one component with props `{ technicians: ProfileTechnician[]; selectedId: string | null; onSelect(id: string): void }` — adjust NewJobScreen imports; zero visual change there.
- [ ] **Task 3 — Edit sheet** (`features/jobDetail/components/EditJobSheet.tsx`, new): Modal bottom-sheet copying AddTechnicianSheet's chrome (grabber, rounded top, KeyboardAvoidingView); props `{ visible, job: JobDetail, technicians, onClose, onSaved(job: ApiJob) }`; internal form state initialized from `job`; `buildPatch()` diff helper returning `UpdateJobRequest | null`:
  ```ts
  const changed = <K extends keyof UpdateJobRequest>(key: K, next: unknown, prev: unknown) => (next !== prev && next !== '' ? { [key]: next } : {});
  // assemble from description/scheduledStart/scheduledEnd/notes/technicianId/priority; return null when empty
  ```
  Save handler: pre-validate schedule (AC 4) → `jobService.update` → onSaved; error branches per AC 6/7.
- [ ] **Task 4 — Cancel flow** (`JobDetailScreen`): destructive action + Alert per AC 5; on success merge `{...detail, ...response}` and clear the sheet state.
- [ ] **Task 5 — Actions slot wiring** (`JobDetailScreen`): render buttons only when `detail.status === 'scheduled'`; open/close sheet state; after ANY successful mutation also fire `loadMyProfile()` (Story 1.4 contract).
- [ ] **Task 6 — Tests**: `buildPatch` (no-change → null; each field individually; date normalization to ISO); one-sided inversion pre-check both directions; 409 branch closes sheet + triggers refetch (mock service).

## Dev Notes

- NEVER combine `status: 'cancelled'` with other fields in one request (server 422s it) — cancel is its own code path.
- `DateTimeFields` emits Dates — convert with `.toISOString()` before diffing (the loaded detail's strings are ISO UTC; compare ISO-to-ISO).
- Clearing a field is impossible by API design (E1). Empty string in an input that HAD a value = keep prior value and omit from patch (document with an inline comment).
- After reassign, the refetched activity log will show `job_reassigned` — good manual verification.
- Files: NEW `features/jobDetail/components/EditJobSheet.tsx`; MODIFY `services/resources/jobs.ts` + barrel, `features/jobDetail/JobDetailScreen.tsx`, `features/newJob/components/TechnicianPicker.tsx` (+ NewJobScreen import), tests.
- [Source: api-contracts.md §6; fenzit-be src/jobs/jobs.service.ts#updateJob L324–481; fenzit-be deferred-work E1/CR1; features/technicians/components/AddTechnicianSheet.tsx (sheet chrome)].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
