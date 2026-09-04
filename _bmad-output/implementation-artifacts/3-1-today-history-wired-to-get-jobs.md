# Story 3.1: Technician Today & History Wired to GET /jobs

Status: done

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

- [x] **Task 1 — Nav restructure**: NEW `navigation/TechnicianRootNavigator.tsx`:
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
- [x] **Task 2 — Store** (`features/technicianApp/useTechnicianJobs.ts`, new — copy the Story 1.1 skeleton): state `{ today: ApiJob[]; history: ApiJob[]; historyCursor: string | null; historyHasMore: boolean; isLoadingToday; isLoadingHistory; isLoadingMore; errorToday; errorHistory; hasLoadedToday; hasLoadedHistory; lastLoadedAt }`; exported fns `loadToday(opts)`, `loadHistory(opts)`, `loadMoreHistory()`, `upsertJob(job)` (updates whichever array holds the id; a job turning completed moves Today→also visible in History on next load — do NOT hand-move between arrays beyond upsert-in-place), `clearTechnicianJobs()`. Internals:
  ```ts
  let hydrateToday = () => jobService.list({});                                  // Epic 4 swaps these two
  let hydrateHistory = (cursor?: string) => jobService.list({ status: ['completed','cancelled'], cursor });
  export function setHydrators(t: typeof hydrateToday, h: typeof hydrateHistory) { hydrateToday = t; hydrateHistory = h; }
  ```
- [x] **Task 3 — Today sections** (`features/technicianApp/todaySections.ts`, new): pure `buildTodaySections(jobs: ApiJob[]): { title: string; data: ApiJob[] }[]` → In progress (`status==='in_progress'`), Scheduled (`'scheduled'`), Done today (`'completed'`); each sorted `scheduledStart` asc; empty sections omitted. TodayScreen switches FlatList → SectionList.
- [x] **Task 4 — Screens** (`TodayScreen.tsx`, `HistoryScreen.tsx`, modify): consume the store; TodayScreen keeps greeting from `useMyProfile`; card press per AC 5; History `onEndReached` → `loadMoreHistory`; RefreshControls force; delete `data.ts` + fix imports; JobCard here gets `customerName` undefined (renders serviceType label as title line — adjust JobCard fallback: title = customerName ?? serviceTypeLabel(job.serviceType)).
- [x] **Task 5 — Placeholder detail** (`features/technicianApp/TechJobDetailScreen.tsx`, new stub): back header + `<Text>{route.params.jobId}</Text>` — replaced wholesale in 3.2.
- [x] **Task 6 — Logout**: technicianApp/ProfileScreen logout handler adds `clearTechnicianJobs()`.
- [x] **Task 7 — Tests**: buildTodaySections ordering/omission; store history append dedup; upsertJob replaces in the correct array.

## Dev Notes

- Do NOT use POST /sync here — that is Epic 4's hydration; the two coexist by design (BE FR-7 vs FR-16).
- Done-today stays visible (honest day count) — AC 2 is deliberate product behaviour.
- `setHydrators` is the entire Epic-4 seam. Keep it dumb: same return type `Promise<Paginated<ApiJob>>` for both paths (sync store will fake the envelope).
- Files: NEW `navigation/TechnicianRootNavigator.tsx`, `features/technicianApp/useTechnicianJobs.ts`, `features/technicianApp/todaySections.ts`, `features/technicianApp/TechJobDetailScreen.tsx`; MODIFY `navigation/types.ts`, `src/App.tsx`, `features/technicianApp/{TodayScreen,HistoryScreen,ProfileScreen}.tsx`, `features/jobs/components/JobCard.tsx` (title fallback); DELETE `features/technicianApp/data.ts`.
- [Source: api-contracts.md §3; src/App.tsx L42–49; navigation/TechnicianTabs.tsx; 1-1 store skeleton; epics.md Review Note 3].

## Dev Agent Record

### Agent Model Used

Claude Code (GLM), 2026-09-04

### Debug Log References

- `bunx tsc --noEmit` clean; `bun run test --watchman=false` → 28 suites / 249 tests pass (incl. 2 new suites, 16 tests).
- No ESLint config exists in this repo (`bun run lint` fails pre-existing) — tsc + jest are the gates.

### Completion Notes List

- **`captionStrong` token added** (`theme/typography.ts`): the spec's "caption semibold" eyebrow needed a role — patching `fontWeight` on `caption` silently does nothing on Android once Inter .ttf files are linked (weight rides the family). Extending tokens first is the design-system rule.
- **`lastLoadedAt` split** into `lastLoadedAtToday` / `lastLoadedAtHistory`: Today and History are different queries — a Today load landing must not throttle away a History tab focus (and vice versa). Deviation from the story's single-field state list, documented here.
- **JobCard got a `showFooter` prop** (default true) instead of a title-fallback change — the `customerName ?? serviceTypeLabel` fallback already existed from Story 1.1; only the footer omission was missing.
- **HistoryScreen renders JobCard with `scope="history"`** (completion date/time from `completedAt`, "Cancelled" for cancelled rows) — semantically right for past jobs, where the old time-only row showed a future slot. Today keeps the default scope (time-only) per the card's own doc.
- **History empty-state copy** per ui-design-spec §7: "No past jobs yet" / "Completed and cancelled jobs will show up here."
- Navigation: screens use `useNavigation<NativeStackNavigationProp<TechnicianRootStackParamList>>()` (imported from `@react-navigation/native-stack`) — the global augmentation stays owner-only as the story requires.
- `loadHistory` chains behind an in-flight page-1 request (queue, not drop) and `loadMoreHistory` is dedup-guarded — same semantics as `useJobs`.

### Code Review Patches (2026-09-04, review round 1 — 10 findings, all applied)

- **CRITICAL — `hydrateHistory` was missing `scope: 'history'`**: the story's own snippet carried the omission. Verified against `fenzit-be` `jobs.service.ts` (`query.scope ?? JobListScope.TODAY`): the server would have day-filtered `scheduled_start`, so History could never show a past job (and scope-tagged cursors would also mismatch). Fixed: `jobService.list({ scope: 'history', status: [...], cursor })`; test pins the exact params.
- **Banner over rows**: a failed refresh with rows on screen now shows a dismissible `InlineError` above the list in both tabs (local `errorDismissed` reset on error change — same idiom as `CustomersScreen`); the full-screen error state stays for the no-data case.
- **`loadToday` queue-behind**: a forced refresh queues behind an in-flight load instead of returning the stale in-flight promise; `loadHistory` shares only same-kind page-1 requests.
- **`historyInFlightKind`** ('load' | 'more') so a page-2 fetch isn't mistaken for a shareable page-1 request.
- **Clock-skew guard** (`elapsed >= 0`) in the throttle check, matching `useCustomers`.
- **`dataGen` mutation guard**: `upsertTechnicianJob` bumps a generation; loads started before an optimistic write discard their response instead of reverting the row (Epic 3 protection). Locked by a dedicated test.
- **Mount auto-load effects removed** from the hook — the screens' `useFocusEffect` own the triggers (avoids a double `GET /jobs` on app start, one per tab, that the old effects plus focus effects would both fire).
- **`upsertJob` renamed to `upsertTechnicianJob`** (deviation from the story's Task 2 name, recorded here) so a barrel-style import can never grab the owner-side `features/jobs` `upsertJob` prepend semantics instead of this replace-in-place one.
- Stale docs fixed: `TechnicianTabs` header (now mounted inside `TechnicianRootNavigator`, not bare in `App.tsx`), `services/resources/jobs.ts` ("owner-only list / technician gets 403" — false, the controller allows both roles and the service scopes technician rows to the caller), `JobCard` scope doc ("technician screens pass nothing" — `HistoryScreen` passes `scope="history"`).
- Deferred: extract a shared store factory for the 4 hand-copied stores (`useMyProfile`, `useCustomers`, `useJobs`, `useTechnicianJobs`) — cross-cutting refactor, not inside this story.

### File List

- NEW `src/navigation/TechnicianRootNavigator.tsx`
- NEW `src/features/technicianApp/useTechnicianJobs.ts`
- NEW `src/features/technicianApp/todaySections.ts`
- NEW `src/features/technicianApp/TechJobDetailScreen.tsx`
- NEW `__tests__/useTechnicianJobs.test.ts`
- NEW `__tests__/today-sections.test.ts`
- MODIFY `src/navigation/types.ts` (TechnicianRootStackParamList)
- MODIFY `src/App.tsx` (TechnicianRootNavigator swap)
- MODIFY `src/features/technicianApp/TodayScreen.tsx` (store + SectionList + eyebrow headers + nav)
- MODIFY `src/features/technicianApp/HistoryScreen.tsx` (store + pagination + nav)
- MODIFY `src/features/technicianApp/ProfileScreen.tsx` (clearTechnicianJobs on logout)
- MODIFY `src/features/technicianApp/index.ts` (export TechJobDetailScreen)
- MODIFY `src/features/jobs/components/JobCard.tsx` (showFooter prop)
- MODIFY `src/theme/typography.ts` (captionStrong role)
- DELETE `src/features/technicianApp/data.ts`

## Change Log

- 2026-09-04 — Story 3.1 implemented: technician Today/History wired to `GET /jobs` via the new `useTechnicianJobs` store (hydrator seam for Epic 4), Today sections, cursor-paginated History, root-stack nav restructure with placeholder TechJobDetail, logout store reset. Status → review.
- 2026-09-04 — Code review round 1 (10 findings) applied: critical `scope: 'history'` fix in `hydrateHistory`, refresh-failure banner over rows, load queue-behind + in-flight-kind tracking, clock-skew guard, `dataGen` optimistic-mutation guard, mount effects removed (screens own triggers), `upsertJob` → `upsertTechnicianJob`, stale docs fixed. Tests now 28 suites / 251 pass; tsc clean.
