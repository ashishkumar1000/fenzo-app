---
baseline_commit: 96647f2e71edfab23cbb2d012b9b5d54d9a65570
---

# Story 1.2: Owner Job Detail Screen

Status: done

## Story

As an owner,
I want to open a job and see everything about it — people, schedule, history, proof of work,
so that I have full context without phoning anyone.

## API Contract (api-contracts.md §4)

`GET /jobs/:id` → `JobDetail = ApiJob + { technician: {id,name,countryCode,phoneNumber,skills[]}, customer: {id,name,countryCode,phoneNumber,address,city}, activityLog: ActivityLogEntry[] (oldest-first), attachments: JobAttachment[] }`. `attachments[].url` is a 1-hour presigned URL, MAY BE NULL, regenerated per call — never persisted. Errors: 404 (missing/cross-tenant), 403 (technician not assigned — owner shouldn't hit it but handle), 400 malformed uuid.

## UI Design (ui-design-spec.md §3, §4 — the authoritative layout; summary below)

Back header (established pattern: ChevronLeft IconButton + title@20 = jobNumber). ScrollView padding s4, section gap s4, order: header card → actions slot (empty, `testID job-detail-actions`) → Customer SectionCard → Technician SectionCard → "Photos & signature" SectionCard (only when attachments exist; AttachmentGrid = 3-col photo grid radius.md + full-width signature tile h96; null-url tile = surfaceSunken + ImageOff + "Tap refresh") → Activity SectionCard (ActivityTimeline: 8px dots color-coded by event class + connector lines + body label + caption timestamp). Header card rows: badges (status + optional Urgent) → serviceTypeLabel heading → meta rows (Calendar date, Clock time, MapPin location) → progress line "Step N of 6 — <label>" only while in_progress → optional description / "Notes for technician" behind dividers. PersonRow: Avatar + bodyStrong name + bodySm sub-line; ONLY the trailing Phone IconButton (44px) dials — the row itself is not pressable. States: loading spinner; 404/403 = EmptyState(FileQuestion) "This job isn't available" / "It may have been removed or reassigned." + "Go back". All copy from spec §15.

## Acceptance Criteria

1. **Given** a JobCard tap, **then** navigation pushes `JobDetail { jobId }` (RootNavigator sibling of Technicians/NewJob, headerShown false, own back header) which fetches on mount and renders: jobNumber + status Badge + priority marker in the header card; current step ("Not started" when null, else the step's display label); serviceType label; scheduledStart/End (formatTimeLabel + date line); serviceLocation; description; notesForTechnician (only when non-null).
2. **Given** the response, **then** a Customer card (name, `formatPhone(countryCode, phoneNumber)` tap-to-call, address + city) and a Technician card (name, phone tap-to-call, skills as comma-joined line) render.
3. **Given** activityLog, **then** an oldest-first vertical timeline renders each entry as `eventLabel(eventType)` + `toLocaleString('en-IN', { day:'numeric', month:'short', hour:'numeric', minute:'2-digit' })`; unknown eventType renders the raw value (never crashes).
4. **Given** attachments, **then** photos (`type === 'photo'`) render in a 3-column thumbnail grid and the signature in its own row; a null `url` renders a placeholder tile with a retry hint (pull-to-refresh regenerates all URLs).
5. **Given** pull-to-refresh, **then** the detail refetches; **given** 404/403, **then** a friendly not-found view ("This job isn't available any more") with a Back button; **given** loading, **then** a centered spinner (never a flash of empty content).
6. An actions slot (empty View with a stable testID `job-detail-actions`) exists below the header card — Story 1.3 fills it.

## Tasks / Subtasks

- [x] **Task 1 — Service** (`services/resources/jobs.ts`): add types per api-contracts.md §4 (`JobDetail`, `ActivityLogEntry`, `JobAttachment`) and
  ```ts
  async function getById(id: string, signal?: AbortSignal): Promise<JobDetail> {
    const res = await apiClient.get<JobDetail>(`/jobs/${id}`, { signal });
    return res.data;
  }
  ```
  Export via barrel.
- [x] **Task 2 — Navigation** (`navigation/types.ts`, `navigation/RootNavigator.tsx`): `JobDetail: { jobId: string }` in `RootStackParamList`; register `<Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ headerShown: false }} />`.
- [x] **Task 3 — Event labels** (`src/features/jobDetail/eventLabels.ts`, new):
  ```ts
  const LABELS: Record<string, string> = {
    job_created: 'Job created', job_reassigned: 'Reassigned to another technician', job_cancelled: 'Job cancelled',
    step_on_my_way: 'On my way', step_arrived: 'Arrived at site', step_in_progress: 'Work started',
    step_photos_uploaded: 'Photos uploaded', step_signature_captured: 'Customer signature captured',
    step_completed: 'Job completed', conflict_resolved: 'Synced an offline update',
  };
  export const eventLabel = (t: string) => LABELS[t] ?? t;
  export const STEP_LABELS: Record<string, string> = { on_my_way: 'On my way', arrived: 'Arrived', in_progress: 'In progress', photos_uploaded: 'Photos uploaded', signature_captured: 'Signature captured', completed: 'Completed' };
  ```
- [x] **Task 4 — Shared detail components** (`src/features/jobDetail/components/`, new — built for reuse by 2.1/3.2): `PersonRow.tsx` (avatar initial, name, phone with Phone icon Pressable → `openTel`, optional sub-line), `ActivityTimeline.tsx` (props `entries: ActivityLogEntry[]`; dot + line + label + timestamp rows), `AttachmentGrid.tsx` (props `attachments: JobAttachment[]`; photo grid via Image with `resizeMode="cover"`, radius.md; signature row full-width; null-url placeholder), `SectionCard.tsx` (Card + title). All composed from `components/ui` + theme tokens.
- [x] **Task 5 — Linking utils** (`src/utils/linking.ts`, new): `openTel(countryCode: string, phoneNumber: string)` → `Linking.openURL('tel:' + countryCode + phoneNumber)` guarded by canOpenURL; `openMaps(address: string, city?: string | null)` → `Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' }) + encodeURIComponent(...)` (used by 3.2 too).
- [x] **Task 6 — Screen** (`src/features/jobDetail/JobDetailScreen.tsx`, new): `useRoute<RouteProp<RootStackParamList,'JobDetail'>>()`; local state `{ detail, isLoading, error }` with fetch-on-mount + `RefreshControl`; header row with IconButton back (ChevronLeft) + jobNumber; not-found branch when `ApiError.status === 404 || 403`; ScrollView layout: header card → actions slot → customer card → technician card → attachments section (only when non-empty) → activity timeline.
- [x] **Task 7 — Entry point**: JobsScreen's JobCard `onPress={() => navigation.navigate('JobDetail', { jobId: job.id })}`.
- [x] **Task 8 — Tests**: eventLabel covers all 10 known types + passthrough; AttachmentGrid null-url branch renders placeholder; not-found branch renders on status 404.

## Dev Notes

- Presigned URLs: render straight from state; no MMKV, no store. A refetch is the ONLY retry for a null/expired URL.
- Detail state is screen-local (not a shared store) — the detail is always refetched on open for fresh URLs; `upsertJob` (Story 1.1) keeps the LIST consistent after mutations, using the `ApiJob` subset of the detail.
- Keep components dumb (props in, UI out) — 3.2 reuses PersonRow/AttachmentGrid/ActivityTimeline with a different screen layout.
- Files: NEW `features/jobDetail/JobDetailScreen.tsx`, `features/jobDetail/eventLabels.ts`, `features/jobDetail/components/{PersonRow,ActivityTimeline,AttachmentGrid,SectionCard}.tsx`, `features/jobDetail/index.ts`, `src/utils/linking.ts`; MODIFY `services/resources/jobs.ts`, `services/resources/index.ts`, `navigation/types.ts`, `navigation/RootNavigator.tsx`, `features/jobs/JobsScreen.tsx`.
- [Source: api-contracts.md §4; fenzit-be src/jobs/jobs.service.ts#getJobDetail; features/profile/format.ts formatPhone; epics.md Review Note 3].

## Dev Agent Record

### Agent Model Used

GLM 5.3 (Claude Code agent session, 2026-09-03)

### Debug Log References

- `bunx tsc --noEmit` → clean (0 errors)
- `bunx jest --no-watchman` → 10 suites passed, 73 tests passed, 0 failed/skipped
  (`--no-watchman` is a sandbox-only workaround; watchman's state dir is unwritable here, not a repo issue)
- Post-review round: `bunx tsc --noEmit` → clean; `bunx jest --no-watchman` → 10 suites passed, 81 tests passed
  (73 → 81: +2 jobs-service `getById`, +1 JobsScreen card-press navigation, +4 job-detail-screen refresh-failure /
  unknown-step / AbortError / unmount-abort, +1 attachment-grid onError). New regression-sensitive tests were
  verified to fail against the pre-fix behavior (refresh-failure and unknown-step cases checked by temporarily
  reverting the fix).

### Completion Notes List

- Copy: not-found title/description use ui-design-spec §3/§15 ("This job isn't available" / "It may have been removed or reassigned.") rather than AC 5's paraphrase "This job isn't available any more" — §15 is the designated single source for copy.
- AC 1's "current step ('Not started' when null)" is implemented per ui-design-spec §3 (and the story's own UI summary): the "Step N of 6 — <label>" line renders only while `status === 'in_progress'` with a non-null `currentStep`; a null step renders no line at all (a null step never co-occurs with in_progress, so "Not started" never has anywhere to show in this layout).
- Pull-to-refresh calls `getById(jobId)` without an abort signal and without the spinner swap — existing content stays on screen under the RefreshControl spinner (spec §3). A refresh failure with content already loaded leaves that content; the InlineError + Retry view shows only when nothing has loaded.
- `formatPhone` (features/profile) is rendered as the PersonRow sub-line on both person cards, making AC 2's `formatPhone(countryCode, phoneNumber)` reference concrete (number joined as `+91 9000000001`); dialing joins them space-free via `openTel` (`tel:+919000000001`).
- `eventLabels.ts` also exports `STEP_ORDER` + `stepNumber` (beyond Task 3's snippet) to compute "Step N of 6" for the header card and later the §9 stepper; unknown steps return 0/label passthrough, never crash.
- Detail state is screen-local as directed: fetch on mount with an `AbortController` (aborted on unmount; `CANCELLED` errors ignored), no MMKV, no shared store; a refetch is the only retry for a null presigned URL.
- AttachmentGrid chunks photos 3-up per row (each tile exactly one-third wide, `aspectRatio: 1`) instead of a percent+gap wrap grid, so tiles are equal without measuring the container; the optional `onRecapture` ghost-sm button is pre-built for Story 3.5.
- SectionCard title is the `heading` role stepped to 16 (`fontSize.base`) per §4's "heading @16"; the back-header title is `typography.title` overridden to 20 — both override patterns already established in the codebase (HomeScreen, EmptyState).
- ESLint could not run: the repo has no eslint configuration file at all (pre-existing — `bun run lint` would fail on any file), so verification was tsc + jest only.
- Tasks/Acceptance Criteria left unticked/verbatim per instructions; Story Status left as `in-progress`.
- Review round (post-implementation fixes, same session):
  - Refresh failure no longer wipes content: `setDetail(null)`/`setError` only happen on a spinner load (`showSpinner`); a failed refresh keeps the loaded detail on screen and logs a `console.warn` (spec §3).
  - Abort detection widened beyond axios' `status 0 + CANCELLED`: also `name === 'AbortError'` and `signal.aborted` (`isAbort` helper).
  - Retry/refresh hardened: a busy ref guard ignores a second load while one is in flight (checked in `handleRefresh` too, so the RefreshControl spinner can never stick), and `latestControllerRef` is aborted on unmount so refresh/retry requests are cancelled as well — refreshes now carry an abort signal.
  - Route-params guard: `params?.jobId`; when missing the screen pops back (`canGoBack` ? `goBack` : `navigate('MainTabs')`) and renders null.
  - Back navigation uses `goBackSafely` (header icon, not-found button, params guard) so a deep link that is the only route on the stack resets to the tabs instead of stranding.
  - AttachmentGrid pads a trailing short photo row with invisible non-interactable filler Views (`testID: 'attachment-filler'`, `pointerEvents: 'none'`), so a 4th photo is never stretched full-width; Image `onError` now swaps a failed load (expired presigned URL) for the same placeholder as a null URL, and photo/signature tiles are keyed by `id:url` so a refetch clears stale failure state.
  - Progress line hidden when `stepNumber(currentStep) === 0` (an unknown step must not render "Step 0 of 6"); total replaced with `STEP_ORDER.length`; status badge label falls back to the raw `detail.status`.
  - Invalid-date guards: `dateLine` and the timeline's timestamp helper return the raw ISO string when `new Date(iso)` is NaN instead of "Invalid Date".
  - `openTel`/`openMaps` no-op on blank inputs; empty `activityLog` hides the Activity card; header title shows "Job details" while detail is null.
  - Doc fix 14a NOT applied: the openTel comment (`+91` + `2121212121` → `tel:+912121212121`) was verified with `bun -e` to already be correct — `tel:+9121212121` (the suggested replacement) is the wrong concatenation. Fix 14b (index.ts comment) applied.
  - Review item 15(ii)'s wording ("progress line shows the raw value") conflicts with item 8(a) ("hide the line when stepNumber is 0"); 8(a) was implemented and the test asserts the line stays hidden (no "Step 0" / raw value rendered).

### File List

- NEW `src/features/jobDetail/JobDetailScreen.tsx` — Task 6 screen (Task 7 wiring lives in JobsScreen)
- NEW `src/features/jobDetail/eventLabels.ts` — Task 3 (eventLabel, STEP_LABELS, STEP_ORDER, stepNumber)
- NEW `src/features/jobDetail/components/SectionCard.tsx` — Task 4
- NEW `src/features/jobDetail/components/PersonRow.tsx` — Task 4 (trailing Phone IconButton → openTel)
- NEW `src/features/jobDetail/components/ActivityTimeline.tsx` — Task 4
- NEW `src/features/jobDetail/components/AttachmentGrid.tsx` — Task 4 (optional onRecapture for 3.5)
- NEW `src/features/jobDetail/index.ts` — feature barrel
- NEW `src/utils/linking.ts` — Task 5 (openTel, openMaps)
- NEW `__tests__/event-labels.test.ts` — Task 8
- NEW `__tests__/attachment-grid.test.tsx` — Task 8 (null-url branch)
- NEW `__tests__/job-detail-screen.test.tsx` — Task 8 (fetch/spinner/404/403/retry/refresh)
- MODIFIED `src/services/resources/jobs.ts` — Task 1 (JobDetail, ActivityLogEntry, JobAttachment, JobDetailTechnician, JobDetailCustomer, jobService.getById)
- MODIFIED `src/services/resources/index.ts` — Task 1 (type barrel)
- MODIFIED `src/navigation/types.ts` — Task 2 (`JobDetail: { jobId: string }`)
- MODIFIED `src/navigation/RootNavigator.tsx` — Task 2 (screen registered, headerShown false)
- MODIFIED `src/features/jobs/JobsScreen.tsx` — Task 7 (JobCard onPress → navigate('JobDetail', { jobId }))
- MODIFIED `src/utils/index.ts` — re-exports openTel/openMaps
- Review-round changes to the above: `JobDetailScreen.tsx` (refresh-failure, abort/retry/params/back guards, progress-line, status fallback, invalid-date, activity guard, title placeholder); `AttachmentGrid.tsx` (row fillers + Image onError); `ActivityTimeline.tsx` (invalid-date guard); `src/utils/linking.ts` (blank-input no-ops); `features/jobDetail/index.ts` (comment accuracy)
- MODIFIED `__tests__/JobsScreen.test.tsx` — review 15: JobCard press → navigate('JobDetail', { jobId })
- MODIFIED `__tests__/jobs-service.test.ts` — review 15: getById hits `/jobs/:id` and forwards the abort signal
- MODIFIED `__tests__/job-detail-screen.test.tsx` — review 15: refresh-failure keeps content, unknown-step line hidden, AbortError ignored, unmount aborts the in-flight request
- MODIFIED `__tests__/attachment-grid.test.tsx` — review round: filler count + failed-image placeholder
- MODIFIED `__tests__/event-labels.test.ts` — review 15: tautological unknown-step test replaced with a real assertion

## Change Log

## Suggested Review Order

**Fetch state machine (the core of the screen)**

- Entry point: screen-local state, fetch-on-mount, refresh/retry policy in one callback
  [`JobDetailScreen.tsx:108`](../../../src/features/jobDetail/JobDetailScreen.tsx#L108)

- Cancellation recognized in three shapes — status 0/CANCELLED, AbortError, signal.aborted
  [`JobDetailScreen.tsx:82`](../../../src/features/jobDetail/JobDetailScreen.tsx#L82)

- Refresh/retry concurrency guard + unmount-aborted in-flight requests
  [`JobDetailScreen.tsx:151`](../../../src/features/jobDetail/JobDetailScreen.tsx#L151)

- No route params (deep link) → pop back instead of crashing
  [`JobDetailScreen.tsx:94`](../../../src/features/jobDetail/JobDetailScreen.tsx#L94)

**Layout & header card**

- ScrollView order: header card → actions slot → customer → technician → attachments → activity
  [`JobDetailScreen.tsx:210`](../../../src/features/jobDetail/JobDetailScreen.tsx#L210)

- Status label falls back to the raw status for an unmapped badge key
  [`JobDetailScreen.tsx:244`](../../../src/features/jobDetail/JobDetailScreen.tsx#L244)

- Progress line hidden for unknown steps; total from STEP_ORDER.length
  [`JobDetailScreen.tsx:277`](../../../src/features/jobDetail/JobDetailScreen.tsx#L277)

- Empty activity log hides the Activity card (attachments already do)
  [`JobDetailScreen.tsx:347`](../../../src/features/jobDetail/JobDetailScreen.tsx#L347)

**Shared components (reused by 2.1 / 3.2)**

- Row-per-three photo grid; invisible fillers keep tiles exactly one-third wide
  [`AttachmentGrid.tsx:110`](../../../src/features/jobDetail/components/AttachmentGrid.tsx#L110)

- Presigned-image failures (expired 1-hour URLs) fall back to the null-URL placeholder
  [`AttachmentGrid.tsx:62`](../../../src/features/jobDetail/components/AttachmentGrid.tsx#L62)

- Dumb timeline: class-coded dots, connector lines, en-IN timestamps
  [`ActivityTimeline.tsx:1`](../../../src/features/jobDetail/components/ActivityTimeline.tsx#L1)

- Only the trailing 44px phone IconButton dials — the row itself is inert
  [`PersonRow.tsx:1`](../../../src/features/jobDetail/components/PersonRow.tsx#L1)

**Event vocabulary & device links**

- Fixed label vocabulary: 10 known events + raw passthrough, never undefined
  [`eventLabels.ts:1`](../../../src/features/jobDetail/eventLabels.ts#L1)

- Dialer/maps joining shared here so 3.2 reuses it; blank inputs no-op
  [`linking.ts:21`](../../../src/utils/linking.ts#L21)

**Service & navigation**

- GET /jobs/:id wire contract per api-contracts §4, signal forwarded
  [`jobs.ts:229`](../../../src/services/resources/jobs.ts#L229)

- JobDetail registered as a headerShown:false sibling of Technicians/NewJob
  [`RootNavigator.tsx:35`](../../../src/navigation/RootNavigator.tsx#L35)

- List entry point: JobCard tap navigates with the job id
  [`JobsScreen.tsx:139`](../../../src/features/jobs/JobsScreen.tsx#L139)

**Tests (supporting)**

- State-machine tests: refresh keeps content, aborts ignored, unknown step hidden
  [`job-detail-screen.test.tsx:1`](../../../__tests__/job-detail-screen.test.tsx#L1)

- getById wire contract pinned at the apiClient boundary
  [`jobs-service.test.ts:1`](../../../__tests__/jobs-service.test.ts#L1)

- List→detail navigation and grid-filler/onError coverage
  [`JobsScreen.test.tsx:1`](../../../__tests__/JobsScreen.test.tsx#L1)
