---
baseline_commit: 572327c8518f6a68a87191f2fb84d2f841b59db4
---

# Story 1.1: Wire Jobs List to GET /jobs

Status: done

## Story

As an owner,
I want the Jobs tab to show my tenant's real jobs from the backend,
so that the board reflects what actually exists instead of local mock data.

## API Contract (authoritative — api-contracts.md §2, §3)

`GET /jobs` → `Paginated<ApiJob>`. Query: `date?` (YYYY-MM-DD, omit = today IST), `status?` (repeatable enum), `technicianId?` (owner-only), `cursor?`, `limit?` (1–50, default 50). Sort `createdAt DESC, id DESC`. Full `ApiJob` shape in api-contracts.md §2 — copy it VERBATIM into code. Key facts: list rows carry `customerId`/`technicianId` (ids only, no names), there is NO `amount` field anywhere, `currentStep` may be null.

## UI Design (ui-design-spec.md §1, §2)

JobCard v2 keeps the existing card anatomy — deltas only: title line = resolved customer name (fallback `serviceTypeLabel`); `priority === 'urgent'` adds a small `<Badge status="cancelled" size="sm">Urgent</Badge>` left of the status badge; footer keeps Avatar + technician name but the amount is DELETED (footer left-aligns); meta rows unchanged (service icon + description, Clock + `formatTimeLabel`). Filter chips keep current visuals; labels All / Scheduled / In progress / Done / Cancelled. Copy strings from spec §15. No new tokens, no new components.

## Acceptance Criteria

1. **Given** an owner with jobs scheduled today, **when** the Jobs tab mounts, **then** `GET /jobs` is called once and real jobs render as JobCards; `features/jobs/data.ts` and its `JOBS` import are deleted.
2. **Given** a status chip (All / Scheduled / In Progress / Done / Cancelled), **when** selected, **then** the list reloads with `?status=` params (`all` sends none; `Done` maps to `completed`) and only matching jobs render.
3. **Given** `hasMore: true`, **when** the user scrolls near the end (`onEndReached`), **then** the next page loads with the returned `nextCursor` and appends with no duplicate ids; **given** pull-to-refresh, **then** page 1 reloads with the active filter.
4. **Given** the screen regains focus after a job is created in NewJob, **then** the list refetches (throttled: skip if last success < 15s ago) and the new job is visible.
5. **Given** an empty result, **then** the existing per-filter empty states render; **given** a failed load with no data, **then** InlineError + Retry; **given** a failed refresh with data present, **then** data stays with a dismissible error banner.
6. Customer names on cards: because list rows carry only `customerId`, JobCard shows the customer name resolved from the `useCustomers` store (`customers.find(c => c.id === job.customerId)?.name ?? 'Customer'`); this is Phase 1-acceptable (customer store loads all pages).
7. `useJobs` is rewritten as an API-backed shared store; the old MMKV persistence and the `amount`/`timeLabel`/`serviceIcon` display type are gone.

## Tasks / Subtasks

- [x] **Task 1 — Types + service** (`src/services/resources/jobs.ts`, modify)
  - [x] Add `ApiJob` interface exactly as api-contracts.md §2 (reuse existing `JobServiceType`, add `JobStatusApi = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'` and `WorkflowStepApi` union).
  - [x] Add `ListJobsQuery { date?: string; status?: JobStatusApi[]; technicianId?: string; cursor?: string; limit?: number }`.
  - [x] Add:
    ```ts
    async function list(query: ListJobsQuery = {}): Promise<Paginated<ApiJob>> {
      const params: Record<string, unknown> = {};
      if (query.date) params.date = query.date;
      if (query.status?.length) params.status = query.status;   // array passed through as-is — the axios instance serializes arrays repeat-style (?status=a&status=b), which is what the backend's query parser expects (bracket style is silently ignored there)
      <!-- 2026-09-03: original comment here claimed Fastify/qs parses both bracket and repeat styles; the live smoke test overturned this — bracket style is silently ignored, so the apiClient now sets `paramsSerializer: { indexes: null }` (axios built-in) to emit repeat style. -->
      if (query.technicianId) params.technicianId = query.technicianId;
      if (query.cursor) params.cursor = query.cursor;
      if (query.limit) params.limit = query.limit;
      const res = await apiClient.get<Paginated<ApiJob>>('/jobs', { params });
      return res.data;
    }
    ```
  - [x] Widen `CreatedJob` to `ApiJob` (POST /jobs returns the full object — api-contracts.md §5); fix the one call site in NewJobScreen if it destructures.
  - [x] Export `jobService = { create, list }` + new types from `services/resources/index.ts`.
- [x] **Task 2 — Formatter layer** (`src/features/jobs/format.ts`, new)
  ```ts
  import type { StatusKey } from '../../theme';
  export function statusToBadge(s: JobStatusApi): Exclude<StatusKey, 'neutral'> {
    return ({ scheduled: 'scheduled', in_progress: 'progress', completed: 'done', cancelled: 'cancelled' } as const)[s];
    // Verified against src/theme/colors.ts: StatusKey = 'done' | 'progress' | 'scheduled' | 'cancelled' | 'neutral'.
  }
  export function serviceTypeToIcon(t: JobServiceType): 'wrench' | 'droplet' | 'snowflake' {
    return t === 'plumbing' ? 'droplet' : t.startsWith('ac_') ? 'snowflake' : 'wrench';
  }
  export function formatTimeLabel(startIso: string, endIso: string | null): string {
    const fmt = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    const start = new Date(startIso);
    return endIso ? `${fmt(start)} – ${fmt(new Date(endIso))}` : fmt(start);
  }
  ```
- [x] **Task 3 — Store rewrite** (`src/features/jobs/useJobs.ts`, overwrite). Canonical API-backed shared-store skeleton (this pattern is reused by Stories 3.1 and others — get it right here):
  ```ts
  import { useCallback, useEffect, useSyncExternalStore } from 'react';
  import { jobService } from '../../services';
  import type { ApiError, ApiJob } from '../../services';
  import type { JobFilter } from './types';

  interface JobsState {
    jobs: ApiJob[]; filter: JobFilter;
    isLoading: boolean; isLoadingMore: boolean;
    error: string | null; hasLoaded: boolean;
    nextCursor: string | null; hasMore: boolean;
    lastLoadedAt: number | null;
  }
  const INITIAL: JobsState = { jobs: [], filter: 'all', isLoading: true, isLoadingMore: false, error: null, hasLoaded: false, nextCursor: null, hasMore: false, lastLoadedAt: null };
  const subscribers = new Set<() => void>();
  let state = INITIAL;
  let inFlight: Promise<void> | null = null;
  function setState(next: Partial<JobsState>) { state = { ...state, ...next }; subscribers.forEach(n => n()); }
  const filterToStatuses = (f: JobFilter) => (f === 'all' ? undefined : [f]);  // JobFilter values become the API enum values in types.ts

  export function loadJobs(filter = state.filter, opts: { force?: boolean } = {}): Promise<void> {
    if (inFlight) return inFlight;
    const fresh = state.lastLoadedAt && Date.now() - state.lastLoadedAt < 15_000;
    if (!opts.force && fresh && filter === state.filter && state.hasLoaded) return Promise.resolve();
    setState({ filter, isLoading: !state.hasLoaded || filter !== state.filter });
    inFlight = jobService.list({ status: filterToStatuses(filter) })
      .then(page => setState({ jobs: page.data, nextCursor: page.nextCursor, hasMore: page.hasMore, hasLoaded: true, isLoading: false, error: null, lastLoadedAt: Date.now() }))
      .catch((e: ApiError) => setState({ isLoading: false, error: e.message }))
      .finally(() => { inFlight = null; });
    return inFlight;
  }
  export function loadMoreJobs(): Promise<void> { /* guard !hasMore || isLoadingMore || inFlight; fetch with cursor; append page.data filtered by !existingIds.has(id); update cursor/hasMore */ }
  export function upsertJob(job: ApiJob): void { const rest = state.jobs.filter(j => j.id !== job.id); setState({ jobs: [job, ...rest] }); }
  export function clearJobs(): void { setState(INITIAL); }
  export function useJobs() { const s = useSyncExternalStore(cb => (subscribers.add(cb), () => subscribers.delete(cb)), () => state); /* auto-load on first mount like useMyProfile; return state + loadJobs/loadMoreJobs/refresh(force)/setFilter */ }
  ```
  Register `clearJobs` with the logout path used in MoreScreen (call it alongside clearTechnicians/clearProfile).
- [x] **Task 4 — types.ts rework** (`src/features/jobs/types.ts`, overwrite): re-export `ApiJob`; `export type JobFilter = 'all' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'` (API enum values, NOT display words); delete the old display `Job` type and `JobServiceIcon` if unused after Task 5.
- [x] **Task 5 — JobCard rework** (`src/features/jobs/components/JobCard.tsx`, modify): prop `job: ApiJob` + `customerName?: string`; render jobNumber (small, muted), customerName, description (fallback: serviceType label), Badge via `statusToBadge`, time via `formatTimeLabel`, urgent priority marker when `priority === 'urgent'`; DELETE the amount row. Update StatusFilterBar labels to map filter values → display copy (Scheduled / In progress / Done / Cancelled — sentence case).
- [x] **Task 6 — JobsScreen wiring** (`src/features/jobs/JobsScreen.tsx`, modify): consume `useJobs()` + `useCustomers()` (for name lookup, AC 6); `useFocusEffect(useCallback(() => { void loadJobs(); }, []))`; FlatList `onEndReached={loadMoreJobs}` (`onEndReachedThreshold={0.4}`), `ListFooterComponent` spinner when `isLoadingMore`, `RefreshControl` → `loadJobs(filter, { force: true })`; delete the `JOBS` import and `features/jobs/data.ts`.
- [x] **Task 7 — TechnicianApp compile fix**: TodayScreen/HistoryScreen import `Job` from `../jobs/types` — switch to `ApiJob`; `technicianApp/data.ts` arrays become `ApiJob[]` (still empty; deleted in Story 3.1). Confirm `bun run lint` and TS pass.
- [x] **Task 8 — Tests** (`__tests__/jobs-format.test.ts`, `__tests__/useJobs.test.ts`): statusToBadge all 4; serviceTypeToIcon all 6; formatTimeLabel with/without end; store: dedup on concurrent load, throttle skip, filter change bypasses throttle, loadMore appends without dup ids, error keeps prior jobs.

## Dev Notes

- Design rules binding (src/theme/DESIGN_SYSTEM.md, CLAUDE.md): tokens only, ui components, Badge fixed vocabulary, sentence case, no emoji. Bun only.
- Do NOT send a `date` param for the default view (server defaults to today IST). A date-picker on Jobs is NOT in scope.
- `all` filter = no status param (server returns all statuses in today's window).
- The `/users/me` embedded `jobs` block is bootstrap-only — this store is the Jobs tab's source of truth.
- Files: NEW `src/features/jobs/format.ts`; MODIFY `services/resources/jobs.ts`, `services/resources/index.ts`, `features/jobs/useJobs.ts`, `features/jobs/types.ts`, `features/jobs/components/JobCard.tsx`, `features/jobs/components/StatusFilterBar.tsx`, `features/jobs/JobsScreen.tsx`, `features/more/MoreScreen.tsx` (logout clear); DELETE `features/jobs/data.ts`.
- [Source: api-contracts.md §0–§3, §5; fenzit-be src/jobs/jobs.service.ts#listJobs; src/features/profile/useMyProfile.ts (pattern); epics.md Review Notes 1, 4, 6].

## Dev Agent Record

### Agent Model Used

GLM (Claude Code session, 2026-09-03)

### Debug Log References

- `bunx tsc --noEmit` — clean after all tasks.
- `bunx jest` — `__tests__/jobs-format.test.ts` + `__tests__/useJobs.test.ts`: 25/25 pass. `__tests__/App.test.tsx` still fails to boot (see Completion Notes — pre-existing, unrelated to this story).
- `bun run lint` — no ESLint config file exists in this repo (pre-existing; eslint exits with "couldn't find a configuration file"). Not fixable within this story's scope.

### Completion Notes List

- **Two spec conflicts resolved with the user before starting:** (1) no jobNumber line on JobCard — followed ui-design-spec §1 over Task 5's stray mention; jobNumber surfaces on the detail screen in Story 1.2. (2) Technician name in the footer resolved from `GET /users/me`'s server-issued `technicians[]` roster (same pattern as customer names), falling back to 'Technician' when the id isn't on the roster.
- **Third conflict (unresolved by user, decided on spec precedence):** AC 6 says the customer-name fallback is `'Customer'`, but the story's own UI Design section and ui-design-spec §1 both say the fallback is `serviceTypeLabel(job.serviceType)` — went with `serviceTypeLabel` (two sources vs one, and it reads better than a placeholder name).
- AC 6 implemented as an id→name `Map` lookup in JobsScreen rather than a literal `customers.find(...)` per card render — same source (`useCustomers` store), O(1) per row instead of O(n).
- Task 2's `format.ts` also carries `serviceTypeLabel` (from spec §1's label map) — JobCard needs it for the title/description fallbacks and it belongs in the formatter layer.
- `JOB_FILTERS` moved from the deleted `data.ts` into `StatusFilterBar.tsx` (the only consumer), with values switched to API enum (`in_progress`/`completed`) and sentence-case labels (All / Scheduled / In progress / Done / Cancelled) per spec §2.
- `CreatedJob` deleted — `create()` returns full `ApiJob` per api-contracts §5. NewJobScreen awaits the call without destructuring, so no call-site change was needed. `upsertJob` is exported from the store for future callers (Story 1.2+) but deliberately not wired into NewJob this story — AC 4's focus-refetch covers the list update.
- `jest.config.js` + `jest.setup.js` added (repo had NO jest config at all — the existing App.test.tsx could never run): RN preset, `transformIgnorePatterns` for the ESM-only deps (@react-navigation, reanimated, worklets, safe-area-context), and the standard reanimated mock. `@react-native/jest-preset@0.86.0` installed as a devDependency (user-approved; pinned to match the RN version — `bun add` initially resolved 0.87.1).
- **`App.test.tsx` remains broken, pre-existing:** after the config fixes it now parses, but `react-native-worklets` (reanimated 4's native companion) crashes at import in jest (`loadUnpackersWithCode` undefined) — no worklets jest mock exists yet. This failure predates the story (the suite never ran at all before) and needs its own piece of work: mock/stub worklets in `jest.setup.js`.
- `loadMoreJobs` fetches with `cursor` only (no `date`), matching the server's day-window semantics; `filterToStatuses(state.filter)` is applied so a paged load never widens the active filter.
- Technician-side (`technicianApp/data.ts`, TodayScreen, HistoryScreen) is a type-only swap to `ApiJob` — arrays stay empty; JobCard renders fine with no `customerName` (falls back to service type label).

### File List

- `src/services/resources/jobs.ts` — modified: ApiJob/JobStatusApi/WorkflowStepApi/ListJobsQuery types, `list()`, `create()` widened to `ApiJob`, `CreatedJob` removed
- `src/services/resources/index.ts` — modified: export surface for the above
- `src/features/jobs/format.ts` — NEW: statusToBadge, serviceTypeToIcon, serviceTypeLabel, formatTimeLabel
- `src/features/jobs/types.ts` — overwritten: re-exports ApiJob, API-enum JobFilter; display `Job`/`JobStatus`/`JobServiceIcon` deleted
- `src/features/jobs/useJobs.ts` — overwritten: API-backed shared store (load/throttle/loadMore/upsert/clear)
- `src/features/jobs/index.ts` — modified: public surface updated
- `src/features/jobs/components/JobCard.tsx` — modified: renders ApiJob + resolved names, urgent badge, amount deleted, footer left-aligned
- `src/features/jobs/components/StatusFilterBar.tsx` — modified: API-enum filter values, sentence-case labels, JOB_FILTERS moved here
- `src/features/jobs/JobsScreen.tsx` — modified: store wiring, focus refetch, pagination, pull-to-refresh, error/empty states, name resolution
- `src/features/jobs/data.ts` — DELETED
- `src/features/technicianApp/data.ts` — modified: arrays typed ApiJob[]
- `src/features/technicianApp/TodayScreen.tsx` — modified: ApiJob type import
- `src/features/technicianApp/HistoryScreen.tsx` — modified: ApiJob type import
- `src/features/more/MoreScreen.tsx` — modified: clearJobs() on logout
- `__tests__/jobs-format.test.ts` — NEW
- `__tests__/useJobs.test.ts` — NEW
- `jest.config.js` — NEW (repo had none)
- `jest.setup.js` — NEW (reanimated mock)
- `package.json` / `bun.lock` — devDependency `@react-native/jest-preset@0.86.0`

## Change Log

- 2026-09-03: Story 1-1 implemented — Jobs tab wired to `GET /jobs` via the rewritten `useJobs` store; ApiJob contract types added to the service layer; JobCard v2 (urgent badge, no amount, resolved names); filter chips on API enums; pagination + pull-to-refresh + throttled focus refetch + error/empty handling; `data.ts` deleted; logout clears the jobs store; 25 new tests; jest infra (config, preset, setup) added for the repo.
- 2026-09-03: Code review (4-layer: blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor) — findings appended below.
- 2026-09-03: All 15 review patches applied (`useJobs` queue-behind/reset-generation/upsert filter-guard, NewJobScreen inserts the created row, JobCard banner + Retry view, `statusToBadge` fallback, jest preset named directly); new tests for wire params, store races, card rendering; 42 tests pass, tsc clean; 4 items moved to `deferred-work.md`. Status → done.
- 2026-09-03: Smoke-test follow-up — live testing proved the Task 1 comment's premise wrong: axios's default serializer emits bracket style (`status[]=a`), which Fastify's default parser sees as a literal key and silently ignores. Added `repeatStyleParamsSerializer` (repeat-style arrays), wired into `apiClient`; jobs.ts comment corrected; +6 serializer tests. Second review of this batch appended below.
- 2026-09-03: Follow-up review decision resolved — the hand-rolled serializer duplicated axios's built-in `paramsSerializer: { indexes: null }` (verified identical wire output on axios 1.19.0, plus correct ISO Date handling). Deleted `paramsSerializer.ts` + its unit test; `apiClient` now sets `paramsSerializer: { indexes: null }` directly; the unit test was replaced by `__tests__/api-client.test.ts` pinning the integrated wire output via `apiClient.getUri(...)` (closes the wire-seam gap). Trailing newlines fixed. 52 tests pass (7 suites), tsc clean.

## Review Findings (2026-09-03)

### Decision needed

- [x] [Review][Decision] AC6 customer-name fallback — implementation uses `serviceTypeLabel` (ui-design-spec §1, two sources) but AC 6's literal text says `?? 'Customer'`. Confirm which wins. — **Resolved (user, 2026-09-03): keep `serviceTypeLabel`**, no change.
- [x] [Review][Decision] `formatTimeLabel` renders in device-local time with no `timeZone` — the server's day window is IST; a device outside IST shows shifted times. Pin `Asia/Kolkata` or accept device-local (all target users are IST)? — **Resolved (user, 2026-09-03): keep device-local**, no change.

### Patch

- [x] [Review][Patch] Filter change / force refresh / focus refetch silently swallowed while any request is in flight — `if (inFlight) return inFlight;` returns the old promise before filter/force handling, so a chip tap during a running request never loads (HIGH; violates AC 2/3/4) [src/features/jobs/useJobs.ts:92]
- [x] [Review][Patch] Failed filter change leaves the previous filter's rows under the new chip — catch keeps old `jobs` while `filter` was already set (HIGH; violates AC 2) [src/features/jobs/useJobs.ts:113-117]
- [x] [Review][Patch] New job can be invisible after create — NewJobScreen discards the created row and the focus refetch is throttled <15s; wire `upsertJob` into the create flow (HIGH; AC 4 fast path) [src/features/newJob/NewJobScreen.tsx:221]
- [x] [Review][Patch] `clearJobs` during an in-flight GET lets the late response commit rows after logout — guard with a generation counter [src/features/jobs/useJobs.ts:167]
- [x] [Review][Patch] Banner dismissal keyed on the `[error]` string — a repeat failure with the same message keeps the banner hidden; reset `errorDismissed` after each refresh attempt completes [src/features/jobs/JobsScreen.tsx:112-114]
- [x] [Review][Patch] Failed-no-data view wires InlineError's X to retry — conflates dismiss with retry (component contract: non-blocking only); omit `onDismiss`, Retry button calls `refresh()` directly [src/features/jobs/JobsScreen.tsx:178-181]
- [x] [Review][Patch] Stale error not cleared when a new load starts — banner persists behind an in-flight load [src/features/jobs/useJobs.ts:99]
- [x] [Review][Patch] `upsertJob` can insert a row under an active status filter that excludes it — skip when the current filter's statuses don't include `job.status` [src/features/jobs/useJobs.ts:161]
- [x] [Review][Patch] `statusToBadge` has no fallback for an unknown status → `undefined` badge/label rendered [src/features/jobs/format.ts:13]
- [x] [Review][Patch] No test executes `jobService.list`'s real param building — AC 2's wire half (status array, `all` sends none) is unverified; add a test mocking only `apiClient` [src/services/resources/jobs.ts:142]
- [x] [Review][Patch] Store tests missing throttle-expiry, `clearJobs`, `upsertJob` cases [__tests__/useJobs.test.ts]
- [x] [Review][Patch] No JobCard render test — the formatters' call sites (arg order, fallbacks) are unverified; small react-test-renderer fixture test [src/features/jobs/components/JobCard.tsx]
- [x] [Review][Patch] Missing trailing newlines on files written this story [src/features/jobs/useJobs.ts, format.ts, types.ts, jest.setup.js, __tests__/useJobs.test.ts]
- [x] [Review][Patch] jest.config.js uses the `'react-native'` shim rather than naming `@react-native/jest-preset` directly — make the dependency the config actually requires explicit [jest.config.js:2]

### Deferred (pre-existing)

- [x] [Review][Defer] App.test.tsx fails to boot — react-native-worklets has no jest mock (`loadUnpackersWithCode`), so the suite has no green baseline [jest.setup.js] — deferred, pre-existing
- [x] [Review][Defer] JobsScreen has no component test (focus refetch, error/empty branches, pagination trigger) — needs navigation-context scaffolding, sits behind the worklets-mock work [src/features/jobs/JobsScreen.tsx] — deferred, pre-existing
- [x] [Review][Defer] `transformIgnorePatterns` allowlist omits other ESM deps (react-native-svg, react-native-mmkv) — surfaces when App.test is repaired [jest.config.js:7] — deferred, pre-existing
- [x] [Review][Defer] 401 forced-logout clears no stores — `setOnUnauthorized` is exported but never registered; global session-expiry handling is Story 5.3's scope, add `clearJobs` there [src/services/api/apiClient.ts:45] — deferred, pre-existing
- [x] [Review][Defer] Technician-side screens render placeholder-heavy cards ('Technician' fallback, service-label titles) — Story 3.1 owns the technician card variant; arrays are empty today [src/features/technicianApp/TodayScreen.tsx] — deferred, pre-existing

## Review Findings — follow-up: params-serializer fix (2026-09-03)

Uncommitted fix batch since commit 9af7937 (paramsSerializer.ts, apiClient.ts wiring, jobs.ts comment, 6-test suite), re-reviewed with all 4 layers. Backend parsing claims were re-verified live (axios 1.19.0 default emits `status%5B%5D=`; `paramsSerializer: { indexes: null }` emits repeat style and drops null/undefined/empty params).

### Decision needed

- [x] [Review][Decision] Hand-rolled serializer duplicates an axios built-in — installed axios 1.19.0's `paramsSerializer: { indexes: null }` produces the identical wire output (repeat-style arrays, null/undefined/empty-array dropped) and additionally serializes `Date` params to ISO strings (the custom one stringifies them via `toString`, which would be wrong). Replacing `repeatStyleParamsSerializer` with the one-line built-in option deletes ~71 lines (module + test) and removes the last divergence risk from axios defaults. [src/services/api/paramsSerializer.ts, src/services/api/apiClient.ts:60] — **Resolved (user, 2026-09-03): switch to the built-in.** Applied.

### Patch

- [x] [Review][Patch] Wire seam is untested — every test calls `serialize()` directly or mocks axios entirely, so removing/typo-ing `paramsSerializer` on the axios instance passes all tests while every repeatable filter silently breaks (the exact failure mode this fix addresses). Pin the integrated output: `apiClient.getUri({ url: '/jobs', params: { status: ['scheduled'] } })` → `?status=scheduled`. [src/services/api/apiClient.ts:60] — fixed: `__tests__/api-client.test.ts`
- [x] [Review][Patch] Missing trailing newlines on both new files — same defect class already patched once in the first review [src/services/api/paramsSerializer.ts, __tests__/params-serializer.test.ts] — fixed: both files deleted in the switch; replacement test file ends with a newline
- [x] [Review][Patch] Story audit trail not updated for this follow-up — Change Log has no entry for the serializer fix; Completion Notes test count is stale (42 → 48); Task 1's inline comment premise ("Fastify/qs parses both bracket and repeat styles") was overturned by the live smoke test but the spec text still carries it [this file] — fixed: Change Log entries added, Task 1 comment corrected with a dated annotation, current count recorded (52 tests)

### Deferred (cross-repo)

- [x] [Review][Defer] Backend contract untestable from this repo — the "Fastify parses repeat style, silently ignores bracket style" claim is only pinned by a live smoke test; add a fenzit-be test asserting the query parser's array behavior [fenzit-be] — deferred, cross-repo follow-up
