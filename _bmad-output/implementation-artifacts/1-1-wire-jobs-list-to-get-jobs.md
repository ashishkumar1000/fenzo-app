# Story 1.1: Wire Jobs List to GET /jobs

Status: ready-for-dev

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

- [ ] **Task 1 — Types + service** (`src/services/resources/jobs.ts`, modify)
  - [ ] Add `ApiJob` interface exactly as api-contracts.md §2 (reuse existing `JobServiceType`, add `JobStatusApi = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'` and `WorkflowStepApi` union).
  - [ ] Add `ListJobsQuery { date?: string; status?: JobStatusApi[]; technicianId?: string; cursor?: string; limit?: number }`.
  - [ ] Add:
    ```ts
    async function list(query: ListJobsQuery = {}): Promise<Paginated<ApiJob>> {
      const params: Record<string, unknown> = {};
      if (query.date) params.date = query.date;
      if (query.status?.length) params.status = query.status;   // axios default serializer emits status[]=a&status[]=b — Fastify/qs parses both bracket and repeat styles into an array; if a 422 ever shows both styles failing, add paramsSerializer joining repeats without brackets
      if (query.technicianId) params.technicianId = query.technicianId;
      if (query.cursor) params.cursor = query.cursor;
      if (query.limit) params.limit = query.limit;
      const res = await apiClient.get<Paginated<ApiJob>>('/jobs', { params });
      return res.data;
    }
    ```
  - [ ] Widen `CreatedJob` to `ApiJob` (POST /jobs returns the full object — api-contracts.md §5); fix the one call site in NewJobScreen if it destructures.
  - [ ] Export `jobService = { create, list }` + new types from `services/resources/index.ts`.
- [ ] **Task 2 — Formatter layer** (`src/features/jobs/format.ts`, new)
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
- [ ] **Task 3 — Store rewrite** (`src/features/jobs/useJobs.ts`, overwrite). Canonical API-backed shared-store skeleton (this pattern is reused by Stories 3.1 and others — get it right here):
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
- [ ] **Task 4 — types.ts rework** (`src/features/jobs/types.ts`, overwrite): re-export `ApiJob`; `export type JobFilter = 'all' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'` (API enum values, NOT display words); delete the old display `Job` type and `JobServiceIcon` if unused after Task 5.
- [ ] **Task 5 — JobCard rework** (`src/features/jobs/components/JobCard.tsx`, modify): prop `job: ApiJob` + `customerName?: string`; render jobNumber (small, muted), customerName, description (fallback: serviceType label), Badge via `statusToBadge`, time via `formatTimeLabel`, urgent priority marker when `priority === 'urgent'`; DELETE the amount row. Update StatusFilterBar labels to map filter values → display copy (Scheduled / In progress / Done / Cancelled — sentence case).
- [ ] **Task 6 — JobsScreen wiring** (`src/features/jobs/JobsScreen.tsx`, modify): consume `useJobs()` + `useCustomers()` (for name lookup, AC 6); `useFocusEffect(useCallback(() => { void loadJobs(); }, []))`; FlatList `onEndReached={loadMoreJobs}` (`onEndReachedThreshold={0.4}`), `ListFooterComponent` spinner when `isLoadingMore`, `RefreshControl` → `loadJobs(filter, { force: true })`; delete the `JOBS` import and `features/jobs/data.ts`.
- [ ] **Task 7 — TechnicianApp compile fix**: TodayScreen/HistoryScreen import `Job` from `../jobs/types` — switch to `ApiJob`; `technicianApp/data.ts` arrays become `ApiJob[]` (still empty; deleted in Story 3.1). Confirm `bun run lint` and TS pass.
- [ ] **Task 8 — Tests** (`__tests__/jobs-format.test.ts`, `__tests__/useJobs.test.ts`): statusToBadge all 4; serviceTypeToIcon all 6; formatTimeLabel with/without end; store: dedup on concurrent load, throttle skip, filter change bypasses throttle, loadMore appends without dup ids, error keeps prior jobs.

## Dev Notes

- Design rules binding (src/theme/DESIGN_SYSTEM.md, CLAUDE.md): tokens only, ui components, Badge fixed vocabulary, sentence case, no emoji. Bun only.
- Do NOT send a `date` param for the default view (server defaults to today IST). A date-picker on Jobs is NOT in scope.
- `all` filter = no status param (server returns all statuses in today's window).
- The `/users/me` embedded `jobs` block is bootstrap-only — this store is the Jobs tab's source of truth.
- Files: NEW `src/features/jobs/format.ts`; MODIFY `services/resources/jobs.ts`, `services/resources/index.ts`, `features/jobs/useJobs.ts`, `features/jobs/types.ts`, `features/jobs/components/JobCard.tsx`, `features/jobs/components/StatusFilterBar.tsx`, `features/jobs/JobsScreen.tsx`, `features/more/MoreScreen.tsx` (logout clear); DELETE `features/jobs/data.ts`.
- [Source: api-contracts.md §0–§3, §5; fenzit-be src/jobs/jobs.service.ts#listJobs; src/features/profile/useMyProfile.ts (pattern); epics.md Review Notes 1, 4, 6].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
