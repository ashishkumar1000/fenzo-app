# Story 3.1: Technician Today & History Wired to GET /jobs

Status: ready-for-dev

## Story

As a technician,
I want to see my real assigned jobs for today and my past jobs,
so that I know my work the moment I log in.

## API Contract (api-contracts.md §3)

Same `GET /jobs` as Story 1.1. Technician-role specifics: server forces `technician_id = caller` (the `technicianId` param is silently ignored — never send it); default window = today IST; History uses `?status=completed&status=cancelled`. Response rows = `ApiJob` (no customer name — Today cards show serviceType + location until Epic 4's sync store supplies `customer.name`).

## UI Design (ui-design-spec.md §7, §1)

Today keeps the greeting header (title@24). SectionList section headers use the eyebrow pattern — the ONE allowed caps use: caption semibold, letterSpacing 0.72, textMuted, UPPERCASE: "IN PROGRESS", "SCHEDULED", "DONE TODAY"; paddingVertical s2; empty sections omitted. Cards = JobCard v2 technician variant: NO footer (technician is themselves), title falls back to serviceTypeLabel until Epic 4 supplies customer names; no extra chrome per section — the Badge carries state. History = plain FlatList of the same cards + footer spinner. Empty states: Today keeps current CalendarCheck copy; History = EmptyState(History icon) "No past jobs yet" / "Completed and cancelled jobs will show up here."

## Acceptance Criteria

1. **Given** the technician side, **then** `App.tsx` renders a new `TechnicianRootNavigator` (native stack: first screen `TechnicianTabs`, plus `TechJobDetail { jobId }` and later `Signature { jobId }`) instead of bare `TechnicianTabs`; `TechnicianRootStackParamList` added to `navigation/types.ts`.
2. **Given** Today mounts, **then** the store loads `jobService.list({})` and renders sections in order: In progress → Scheduled (each `scheduledStart` ascending) → Done (today's completed, collapsed under a "Done today" heading); `TODAY_JOBS` and `technicianApp/data.ts` are deleted.
3. **Given** History mounts, **then** `jobService.list({ status: ['completed','cancelled'] })` loads with cursor pagination (load-more on scroll end, no duplicate ids); newest first (server order).
4. **Given** focus or pull-to-refresh on either tab, **then** refetch with the shared 15s throttle / force respectively; empty states keep current copy; error states use InlineError + retry.
5. **Given** any job card tap, **then** `navigation.navigate('TechJobDetail', { jobId })` (screen body is Story 3.2 — register a placeholder screen that renders the jobId so navigation is testable now).
6. **DESIGN AC** — all reads go through `useTechnicianJobs()` selectors; the fetch lives behind two swappable functions (`hydrateToday`, `hydrateHistory`) so Epic 4 re-points hydration to the sync store WITHOUT touching TodayScreen/HistoryScreen/TechJobDetail. Screens import the hook only, never jobService.
7. **Given** technician logout (technicianApp ProfileScreen), **then** `clearTechnicianJobs()` runs.

## Tasks / Subtasks

- [ ] **Task 1 — Nav restructure**: NEW `navigation/TechnicianRootNavigator.tsx`:
  ```tsx
  const Stack = createNativeStackNavigator<TechnicianRootStackParamList>();
  export default function TechnicianRootNavigator() {
    return (
      <Stack.Navigator initialRouteName="TechnicianTabs">
        <Stack.Screen name="TechnicianTabs" component={TechnicianTabs} options={{ headerShown: false }} />
        <Stack.Screen name="TechJobDetail" component={TechJobDetailScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    );
  }
  ```
  `navigation/types.ts`: `export type TechnicianRootStackParamList = { TechnicianTabs: undefined; TechJobDetail: { jobId: string }; Signature: { jobId: string } }` (Signature registered in 3.5). `App.tsx`: swap `<TechnicianTabs />` → `<TechnicianRootNavigator />` inside the existing NavigationContainer. NOTE: the global `ReactNavigation.RootParamList` augmentation is the OWNER list — technician screens type navigation locally via `NativeStackScreenProps<TechnicianRootStackParamList, ...>`, do not merge the two lists.
- [ ] **Task 2 — Store** (`features/technicianApp/useTechnicianJobs.ts`, new — copy the Story 1.1 skeleton): state `{ today: ApiJob[]; history: ApiJob[]; historyCursor: string | null; historyHasMore: boolean; isLoadingToday; isLoadingHistory; isLoadingMore; errorToday; errorHistory; hasLoadedToday; hasLoadedHistory; lastLoadedAt }`; exported fns `loadToday(opts)`, `loadHistory(opts)`, `loadMoreHistory()`, `upsertJob(job)` (updates whichever array holds the id; a job turning completed moves Today→also visible in History on next load — do NOT hand-move between arrays beyond upsert-in-place), `clearTechnicianJobs()`. Internals:
  ```ts
  let hydrateToday = () => jobService.list({});                                  // Epic 4 swaps these two
  let hydrateHistory = (cursor?: string) => jobService.list({ status: ['completed','cancelled'], cursor });
  export function setHydrators(t: typeof hydrateToday, h: typeof hydrateHistory) { hydrateToday = t; hydrateHistory = h; }
  ```
- [ ] **Task 3 — Today sections** (`features/technicianApp/todaySections.ts`, new): pure `buildTodaySections(jobs: ApiJob[]): { title: string; data: ApiJob[] }[]` → In progress (`status==='in_progress'`), Scheduled (`'scheduled'`), Done today (`'completed'`); each sorted `scheduledStart` asc; empty sections omitted. TodayScreen switches FlatList → SectionList.
- [ ] **Task 4 — Screens** (`TodayScreen.tsx`, `HistoryScreen.tsx`, modify): consume the store; TodayScreen keeps greeting from `useMyProfile`; card press per AC 5; History `onEndReached` → `loadMoreHistory`; RefreshControls force; delete `data.ts` + fix imports; JobCard here gets `customerName` undefined (renders serviceType label as title line — adjust JobCard fallback: title = customerName ?? serviceTypeLabel(job.serviceType)).
- [ ] **Task 5 — Placeholder detail** (`features/technicianApp/TechJobDetailScreen.tsx`, new stub): back header + `<Text>{route.params.jobId}</Text>` — replaced wholesale in 3.2.
- [ ] **Task 6 — Logout**: technicianApp/ProfileScreen logout handler adds `clearTechnicianJobs()`.
- [ ] **Task 7 — Tests**: buildTodaySections ordering/omission; store history append dedup; upsertJob replaces in the correct array.

## Dev Notes

- Do NOT use POST /sync here — that is Epic 4's hydration; the two coexist by design (BE FR-7 vs FR-16).
- Done-today stays visible (honest day count) — AC 2 is deliberate product behaviour.
- `setHydrators` is the entire Epic-4 seam. Keep it dumb: same return type `Promise<Paginated<ApiJob>>` for both paths (sync store will fake the envelope).
- Files: NEW `navigation/TechnicianRootNavigator.tsx`, `features/technicianApp/useTechnicianJobs.ts`, `features/technicianApp/todaySections.ts`, `features/technicianApp/TechJobDetailScreen.tsx`; MODIFY `navigation/types.ts`, `src/App.tsx`, `features/technicianApp/{TodayScreen,HistoryScreen,ProfileScreen}.tsx`, `features/jobs/components/JobCard.tsx` (title fallback); DELETE `features/technicianApp/data.ts`.
- [Source: api-contracts.md §3; src/App.tsx L42–49; navigation/TechnicianTabs.tsx; 1-1 store skeleton; epics.md Review Note 3].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
