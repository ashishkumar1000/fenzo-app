# Story 1.2: Owner Job Detail Screen

Status: ready-for-dev

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

- [ ] **Task 1 — Service** (`services/resources/jobs.ts`): add types per api-contracts.md §4 (`JobDetail`, `ActivityLogEntry`, `JobAttachment`) and
  ```ts
  async function getById(id: string, signal?: AbortSignal): Promise<JobDetail> {
    const res = await apiClient.get<JobDetail>(`/jobs/${id}`, { signal });
    return res.data;
  }
  ```
  Export via barrel.
- [ ] **Task 2 — Navigation** (`navigation/types.ts`, `navigation/RootNavigator.tsx`): `JobDetail: { jobId: string }` in `RootStackParamList`; register `<Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ headerShown: false }} />`.
- [ ] **Task 3 — Event labels** (`src/features/jobDetail/eventLabels.ts`, new):
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
- [ ] **Task 4 — Shared detail components** (`src/features/jobDetail/components/`, new — built for reuse by 2.1/3.2): `PersonRow.tsx` (avatar initial, name, phone with Phone icon Pressable → `openTel`, optional sub-line), `ActivityTimeline.tsx` (props `entries: ActivityLogEntry[]`; dot + line + label + timestamp rows), `AttachmentGrid.tsx` (props `attachments: JobAttachment[]`; photo grid via Image with `resizeMode="cover"`, radius.md; signature row full-width; null-url placeholder), `SectionCard.tsx` (Card + title). All composed from `components/ui` + theme tokens.
- [ ] **Task 5 — Linking utils** (`src/utils/linking.ts`, new): `openTel(countryCode: string, phoneNumber: string)` → `Linking.openURL('tel:' + countryCode + phoneNumber)` guarded by canOpenURL; `openMaps(address: string, city?: string | null)` → `Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' }) + encodeURIComponent(...)` (used by 3.2 too).
- [ ] **Task 6 — Screen** (`src/features/jobDetail/JobDetailScreen.tsx`, new): `useRoute<RouteProp<RootStackParamList,'JobDetail'>>()`; local state `{ detail, isLoading, error }` with fetch-on-mount + `RefreshControl`; header row with IconButton back (ChevronLeft) + jobNumber; not-found branch when `ApiError.status === 404 || 403`; ScrollView layout: header card → actions slot → customer card → technician card → attachments section (only when non-empty) → activity timeline.
- [ ] **Task 7 — Entry point**: JobsScreen's JobCard `onPress={() => navigation.navigate('JobDetail', { jobId: job.id })}`.
- [ ] **Task 8 — Tests**: eventLabel covers all 10 known types + passthrough; AttachmentGrid null-url branch renders placeholder; not-found branch renders on status 404.

## Dev Notes

- Presigned URLs: render straight from state; no MMKV, no store. A refetch is the ONLY retry for a null/expired URL.
- Detail state is screen-local (not a shared store) — the detail is always refetched on open for fresh URLs; `upsertJob` (Story 1.1) keeps the LIST consistent after mutations, using the `ApiJob` subset of the detail.
- Keep components dumb (props in, UI out) — 3.2 reuses PersonRow/AttachmentGrid/ActivityTimeline with a different screen layout.
- Files: NEW `features/jobDetail/JobDetailScreen.tsx`, `features/jobDetail/eventLabels.ts`, `features/jobDetail/components/{PersonRow,ActivityTimeline,AttachmentGrid,SectionCard}.tsx`, `features/jobDetail/index.ts`, `src/utils/linking.ts`; MODIFY `services/resources/jobs.ts`, `services/resources/index.ts`, `navigation/types.ts`, `navigation/RootNavigator.tsx`, `features/jobs/JobsScreen.tsx`.
- [Source: api-contracts.md §4; fenzit-be src/jobs/jobs.service.ts#getJobDetail; features/profile/format.ts formatPhone; epics.md Review Note 3].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
