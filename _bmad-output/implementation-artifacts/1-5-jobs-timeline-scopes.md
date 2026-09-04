# Story 1.5: Jobs Timeline Scopes

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

> **⚠️ Breaking change from BE 3-7 is already accepted — FE breaks until this story ships.**
> fenzit-be story 3-7 (merged/deploys first) removed `jobStatusCounts` from `GET /users/me`
> and replaced it with `jobCounts` ({ today, upcoming, overdue, completed, cancelled }).
> Until this story implements that rename, `HomeScreen.tsx` (the
> `jobStatusCounts.scheduled + inProgress + …` sums) and `HomeHeader.tsx` render
> **"NaN jobs / NaN done"** on every profile load. This break window was reviewed and
> **accepted 2026-09-04 (pre-launch, no real users)** — do not add a BE compatibility shim;
> the fix is entirely this story: switch `HomeScreen.tsx` / `HomeHeader.tsx` /
> `src/services/resources/users.ts` to `jobCounts`. Job rows also gain
> `completedAt: string | null` (see API Contract below).

## Story

As an owner,
I want the Jobs tab split into Today / Upcoming / Overdue / History and the Home tiles to show those actionable counts,
so that no job — future-booked or past-dated — is ever invisible, and the dashboard pushes me to what needs action.

## Background (why this story exists)

`GET /jobs` (Story 1.1) is day-scoped, so a job booked 3 days out vanishes on creation and a
missed job vanishes the next day — while Home shows an all-time total that disagrees with the
tab (verified: tenant with 4 scheduled jobs shows "4" on Home, "1" on the Jobs tab).
`fenzit-be` Story **3-7** reshapes the backend for the full timeline; **this story consumes it.**

**Dependency / deploy order (hard):** blocked by `fenzit-be` 3-7 — BE merges and deploys FIRST
(this is the deliberate breaking change: the profile's `jobStatusCounts` is replaced by
`jobCounts`). Until the BE story ships, any dev/testing of this story needs the new backend
running locally.

**Sequencing with sibling stories (avoid rework):** implement **after** 1-3
(edit-reassign-cancel) and **1-4** (home stats refresh) — both are `ready-for-dev` and both
touch `HomeScreen`/`useMyProfile`/`useJobs` files this story also touches. Land 1-3, then 1-4,
then this one; 1-4's throttle/focus machinery is reused as-is here.

## API Contract (fenzit-be 3-7)

- `GET /jobs?scope=today|upcoming|overdue|history` (default `today`).
  **`scope` and `date` together are 422 only when `scope` is present AND `scope !== 'today'`;
  `scope='today'` with `date` is legal** (today is the default scope; `date` re-anchors its
  window). Cursor is scope-tagged server-side — a cursor minted under one scope 400s against
  another.
  - today: today's IST window, any status, sort `created_at DESC`; the repeatable `status`
    filter applies (the existing chips).
  - upcoming: `scheduled_start >= start of TOMORROW IST` AND `status='scheduled'`, sort
    `scheduled_start ASC` (soonest first). The tomorrow boundary makes the four timeline
    buckets mutually exclusive — a job scheduled today is ONLY in Today, never double-counted
    in the Upcoming tile or list (BE 3-7 AC #4/#9).
  - overdue: `scheduled_start < today-start IST` AND status not completed/cancelled, sort
    `scheduled_start ASC` (oldest problem first).
  - history: `status IN (completed, cancelled)` by default, sort `scheduled_start DESC`; the
    repeatable `status` filter narrows it (All/Done/Cancelled chips).
- `GET /users/me` returns `jobCounts: { today, upcoming, overdue, completed, cancelled }`
  (replaces `jobStatusCounts`).
- Every job object gains `completedAt: string | null`. (Two BE payloads deliberately do NOT
  have it yet — technician delta-sync and customer-detail job history, per BE 3-7 AC #10.
  Nothing in the app consumes those as `ApiJob` today; when 4-1/2-2 wire them, treat those
  rows as lacking the field.)

## Acceptance Criteria

1. **Given** the services layer is updated, **then** `MyProfile.jobCounts` replaces
   `jobStatusCounts` (shape `{ today, upcoming, overdue, completed, cancelled }`), `ApiJob`
   gains `completedAt: string | null`, and `ListJobsQuery` gains
   `scope?: 'today' | 'upcoming' | 'overdue' | 'history'` — typed in
   `src/services/resources/users.ts` and `jobs.ts`, with zero remaining references to
   `JobStatusCounts` anywhere in the app (exhaustive current usage is exactly four files:
   `src/screens/HomeScreen.tsx`, `src/components/HomeHeader.tsx`,
   `src/services/resources/users.ts`, `src/services/resources/index.ts` — nothing in
   `features/more`, `features/technicianApp`, `features/technicians`, or `features/profile`
   reads it).

2. **Given** the Jobs tab, **then** a scope selector (Today · Upcoming · Overdue · History) is
   the top-level control, **Today is the default**, and switching scope loads that scope fresh
   (no stale rows or cursor from the previous scope ever render). Visual treatment follows the
   design system (`@components/ui` + `@theme` tokens; no hard-coded values).

3. **Given** the **Today** scope, **then** the existing `StatusFilterBar` chips
   (All/Scheduled/In progress/Done/Cancelled) behave exactly as today — Story 1.1 behaviour is
   a regression baseline, byte-for-byte.

4. **Given** the **Upcoming** or **Overdue** scope, **then** the status chip row is hidden
   (the server pre-narrows status; chips would lie). Upcoming rows show their scheduled date;
   Overdue rows show an "N days overdue" badge computed from `scheduled_start` vs today (IST),
   using a new pure util in `@utils` (see Task 3 — no date utils exist today).

5. **Given** the **History** scope, **then** the chip row shows only All / Done / Cancelled
   (`all` → no status param → both), rows show `completedAt` (or "Cancelled") in the
   scheduled-time meta row, and empty states use per-scope copy (extend the `EMPTY_BY_FILTER`
   pattern; every scope × chip combination has real copy — no invented rows).

6. **Given** the store (`useJobs`), **then** `scope` joins `filter` in the state:
   `loadJobs(scope, filter, opts)`, the 15s throttle keys on `(scope, filter)`, in-flight
   de-dup compares both, and a scope change behaves exactly like the existing changed-filter
   path (`useJobs.ts:116-148`): show the loading state over the old rows, drop the previous
   scope's cursor, and on failure clear rows/cursor (the `:148` precedent). Invariant: the
   previous scope's rows never render under the new scope and its cursor is never sent (a
   `jobs-list` cursor replayed against another scope would 400 server-side).

7. **Given** the store's `upsertJob`, **then** it is **restricted to the `today` scope AND the
   existing filter guard is kept**: prepend only when `state.scope === 'today'` AND
   (`state.filter === 'all'` OR `state.filter === job.status`) — matching Today's
   `created_at DESC` sort. The current filter skip ("a freshly created scheduled job must not
   appear under a Done chip", `useJobs.ts:196-206`) stays; the scope guard is added alongside
   it. For every other active scope — including `upcoming` and `history` — `upsertJob` is a
   **no-op** and the throttled focus refetch picks the row up. (Prepending into
   `upcoming`/`history` would violate their `scheduled_start`-keyed server sorts, and the
   server sorts must never be re-sorted client-side.)

8. **Given** Home (established account), **then** the stat tiles are
   **Today** / **Upcoming** / **Overdue** (from `profile.jobCounts`) plus the Technicians tile
   (two rows × two half-width tiles — the existing `statsRow` geometry extended to a second
   row), and each job tile is pressable, navigating to the Jobs tab pre-set to that scope
   (e.g. Overdue tile → Jobs with scope=overdue). The all-time "Jobs" tile and its
   "N done · N active · N sched." detail line are gone, including `HomeHeader`'s own
   `totalJobs` computation and `JobStatusCounts` import/prop.

9. **Given** the setup-complete check, **then** a pure helper `hasAnyJobCount(jobCounts)`
   (any of the five fields > 0) is extracted and testable without mounting the screen, and the
   screen keeps the existing conjunction: `isSetupComplete = hasTechnicians &&
   hasAnyJobCount(jobCounts)` (the `hasTechnicians` conjunct at `HomeScreen.tsx:108-113` is
   preserved — do not drop it). New-user Home behaviour is otherwise unchanged.

10. **Given** Home tile → Jobs navigation, **then** the scope param is consumed **then
    cleared** (`navigation.setParams({ scope: undefined })` immediately after applying): tab
    params persist across navigations, so without consume-then-clear a one-time Overdue tile
    press would re-apply `overdue` on every later tab-bar focus and fight a scope the user
    picked manually. The param is applied only when it differs from the store's scope, and
    param consumption happens **before** the focus refetch inside the same `useFocusEffect`
    (no race with the existing focus `loadJobs()`). The consuming code lives in `JobsScreen`
    (it reads `route`, applies to the store, and clears the param) — this AC is implemented in
    Task 3 even though the navigation originates in Task 4's Home tiles.

11. **Given** a scope/counts load fails, **then** existing failure semantics hold: Jobs tab
    keeps prior rows and shows the dismissible error banner; Home keeps the stale tiles with
    its banner (1-4's rules). No blank screens.

12. **Given** `bun run lint` and the test suite, **then** both pass with new tests: store
    scope-switching (changed-filter semantics, throttle keying, upsert today+filter
    restriction), utils (IST day-diff / overdue-days, injectable now), and the extracted
    setup-complete helper. Existing assertions pinning old shapes/behaviour are updated —
    notably `__tests__/jobs-service.test.ts` (`params: {}`), `__tests__/useJobs.test.ts`
    (param shapes + upsert skip tests), and `__tests__/JobsScreen.test.tsx` (param shape +
    route stub) — see Task 5 for the exact spots.

## Tasks / Subtasks

- [x] **Task 1 — Services layer** (AC: #1)
  - [x] `src/services/resources/users.ts`: `JobCounts` interface replaces `JobStatusCounts`
        (`:47-52`); `MyProfile.jobCounts` (`:106`); update the barrel re-export in
        `src/services/resources/index.ts:39`.
  - [x] `src/services/resources/jobs.ts`: `ApiJob.completedAt` (`:77` block), `scope` on
        `ListJobsQuery` (`:171-182`), passed through `list()`'s param serialization
        (`:206-213`).
  - [x] Grep-verify: no `jobStatusCounts`/`JobStatusCounts` references remain.

- [x] **Task 2 — `useJobs` store: scope dimension** (AC: #6, #7, #11)
  - [x] `src/features/jobs/useJobs.ts`: add `scope: JobScope` to `JobsState` + `INITIAL`
        (default `'today'`); `JobScope` type in `src/features/jobs/types.ts` next to `JobFilter`.
  - [x] `loadJobs(scope, filter, opts)`: throttle/in-flight keys become `(scope, filter)`;
        a scope change mirrors the existing `changedFilter` handling at `:116-148` exactly
        (loading state over old rows, drop prior cursor, failure branch clears rows/cursor —
        do NOT clear rows eagerly before the request). Keep the request-queueing semantics
        intact — a scope switch queued behind an in-flight page-2 fetch must not be swallowed.
  - [x] Update the `refresh` callback (`useJobs.ts:229`) — with the new signature its current
        `{ force: true }` second arg lands in the `filter` slot; it must become
        `loadJobs(state.scope, state.filter, { force: true })`.
  - [x] `loadMoreJobs` sends `scope: state.scope` with the cursor (`:170`).
  - [x] `upsertJob` (`:201-206`): KEEP the existing `filterToStatuses` filter-skip logic and
        ADD the scope guard on top — prepend only when `state.scope === 'today'` AND the job
        computes to today (IST) AND the filter allows the status (AC #7). No-op otherwise.
  - [x] `useJobs()` hook: expose `scope` + `setScope` (mirrors `setFilter`); mount effect and
        focus-refetch unchanged.

- [x] **Task 3 — Jobs tab UI** (AC: #2, #3, #4, #5)
  - [x] New IST-aware date util in `src/utils/` (day diff for "N days overdue" + a date label
        for Upcoming rows). It must take an injectable `nowIso` (or today-start) parameter so
        tests don't depend on the host machine's timezone/clock (jest runs in host TZ, not
        IST). **No date utils exist today** — `src/utils/` only re-exports `linking.ts`; time
        formatting lives scattered in features
        (`features/jobs/format.ts`, `features/customers/format.ts`,
        `features/jobDetail/JobDetailScreen.tsx`, `features/newJob/components/DateTimeFields.tsx`)
        and is device-TZ-naive (`toLocaleTimeString('en-IN', …)` is a locale, not a timezone),
        with Hermes shipping incomplete Intl (see comments in `customers/format.ts:44-46`).
        Build the util by hand in the same spirit; do NOT reuse those helpers for day math.
  - [x] `src/features/jobs/JobsScreen.tsx`: scope selector above the chip row. No segmented
        control exists in `@components/ui` — build one mirroring `StatusFilterBar`'s chip row
        pattern (`Pressable` + `accessibilityRole` + `accessibilityState.selected`), tokenized
        per DESIGN_SYSTEM.md. Default Today. Also: read the `scope` nav param via `route`
        (the screen currently destructures only `navigation`, `JobsScreen.tsx:83`) and
        implement AC #10's consume-then-clear here (`navigation.setParams({ scope: undefined })`
        before the focus refetch inside `useFocusEffect`).
  - [x] Chips: visible only in Today (all five) and History (All/Done/Cancelled); hidden in
        Upcoming/Overdue. `StatusFilterBar` hardcodes its filter list — add a subset prop.
        `EMPTY_BY_FILTER` becomes scope-aware (scope × chip matrix).
  - [x] `JobCard` (`./components/JobCard.tsx`): add an **optional** `scope` prop that defaults
        to today's current time-only rendering. `src/features/technicianApp/TodayScreen.tsx:47`
        and `src/features/technicianApp/HistoryScreen.tsx:36` render `<JobCard job={item}
        onPress={...} />` with no scope — they pass nothing and MUST render byte-identical to
        today. Per-scope content goes in the scheduled-time meta row (the `formatTimeLabel`
        row) — Upcoming: scheduled date (needs the new date label util; JobCard shows times
        only today); Overdue: "N days overdue" badge; History: `completedAt`/Cancelled.
  - [x] Focus-refetch, pagination, pull-to-refresh flows unchanged (store handles them).

- [x] **Task 4 — Home dashboard tiles** (AC: #8, #9, #10)
  - [x] `src/screens/HomeScreen.tsx`: `isSetupComplete` (`:113`) keeps the `hasTechnicians`
        conjunct and gains the extracted `hasAnyJobCount(jobCounts)` pure helper (AC #9);
        remove the `totalJobs` sum (`:102-107`); pass `jobCounts` + `onTilePress(scope)` to
        `HomeHeader`. Extend `MainTabParamList`'s `Jobs` entry in `navigation/types.ts:11-16`
        to `Jobs: { scope?: JobScope } | undefined` (flat param shape, NOT double-nested
        `params?: {…}` — idiomatic React Navigation gives `route.params?.scope` without an
        extra `.params` hop). The param is consumed/cleared in JobsScreen per Task 3/AC #10.
  - [x] `src/components/HomeHeader.tsx`: tiles become Today/Upcoming/Overdue + Technicians,
        two rows (`StatCard` usages `:116-133`, local `totalJobs` `:79-83`, `JobStatusCounts`
        import/prop `:5,63`, and the "Deliberately labeled Jobs" comment `:77-78` all go);
        make `StatCard` pressable (`Pressable`, ≥44px target).
  - [x] `src/features/home/components/QuickActions.tsx:65-76`: its "All jobs" tile currently
        navigates to `Jobs` with no params — with the all-time view gone it silently becomes
        "Today". Relabel to "Today's jobs" (jumping to Today) — decided; don't invent a new
        all-time view. Also rename the `onAllJobs` prop (`:21,65`) to `onTodayJobs` so the
        name doesn't outlive its meaning.
  - [x] Keep 1-4's throttle/focus behaviour untouched — this story only changes what the tiles
        display and where they navigate.

- [x] **Task 5 — Tests** (AC: #12)
  - [x] `useJobs` store tests: scope change behaves like the changed-filter path (old rows
        never render under the new scope, prior cursor dropped, failure clears rows); throttle
        keyed per (scope, filter); `upsertJob` today+filter restriction (scope guard AND filter
        guard).
  - [x] Update `__tests__/useJobs.test.ts` — it pins the OLD shapes/behaviour and WILL fail:
        `:109` `toHaveBeenLastCalledWith({ status: ['completed'] })`, `:127`, `:140`, `:191`
        (cursor-only param shapes) gain `scope`; `:230-247` pins the exact filter-skip behaviour
        Task 2 extends — rewrite the upsert tests for the scope+filter rule.
  - [x] Update `__tests__/JobsScreen.test.tsx:240` (pins `{ cursor: 'cursor-1' }` param shape)
        and stub the `route` param the screen now reads.
  - [x] New IST util tests (same-day is not overdue; IST boundary; date label) — util takes
        injectable `nowIso`, tests pass fixed timestamps.
  - [x] Extracted `hasAnyJobCount` helper test.
  - [x] Update `__tests__/jobs-service.test.ts` param assertions for the `scope` passthrough
        (`:21-24` pins `params: {}` today).
  - [x] `bun run lint` + tests green.

### Review Findings

- [x] [Review][Decision] `setScope` sends the current status filter with a non-today scope —
      **Resolved 2026-09-04: aligned with the screen rule.** BE check confirmed the server
      does NOT reject incompatible combos — it silently intersects and returns an empty list,
      with a comment stating "the FE never sends such combinations" (fenzit-be
      `jobs.service.ts` ~L541) — so the FE must guarantee it. The scope→chip rule is now
      shared: `src/features/jobs/scopeFilters.ts` exports `filterForScope` + `HISTORY_FILTERS`,
      the screen's local copy is deleted, and `setScope` applies it
      (`loadJobs(next, filterForScope(state.filter, next))`). Pinned by a new
      `__tests__/scopeFilters.test.ts` (5 tests) + 2 `setScope` rule tests in useJobs.test.ts.
- [x] [Review][Decision] Overdue stat tile borrows the cancelled status palette —
      **Resolved 2026-09-04: switched to the neutral palette** (`colors.status.neutral.*`,
      same as JobCard's overdue badge); comment updated to cite the DS rule.
      [src/components/HomeHeader.tsx]
- [x] [Review][Decision] StatCard press has no pressed-state visual feedback —
      **Resolved 2026-09-04: pressed opacity 0.8 added** (same value as ScopeSelector's
      chips). [src/components/HomeHeader.tsx]
- [x] [Review][Patch] — applied 2026-09-04: "Today's jobs" tile doesn't jump to Today — `navigate('Jobs')` sends no
      scope param, so the module-level store's last-used scope (e.g. Overdue) shows under a
      "Today's jobs" label; story Task 4 explicitly decided "(jumping to Today)". Fix:
      `navigate('Jobs', { scope: 'today' })` + test coverage for the wiring.
      [src/screens/HomeScreen.tsx:63]
- [x] [Review][Patch] — applied 2026-09-04: Add a route-param consumption test for JobsScreen — mount with
      `route.params = { scope: 'overdue' }`, assert `list` called with that scope AND
      `setParams` called with `{ scope: undefined }`; no test exercises AC #10's one-shot
      param (the mount helper locks `params: undefined`). [__tests__/JobsScreen.test.tsx]
- [x] [Review][Patch] — applied 2026-09-04: Add screen-level scope-switch tests — press scope chips and assert the
      `list` query (scope + the filter `filterForScope` picked), the History three-chip
      subset, and the per-scope empty-state copy; `filterForScope`/`handleScopeChange`,
      `ScopeSelector` and `StatusFilterBar`'s subset prop are all currently unexercised.
      [__tests__/JobsScreen.test.tsx]
- [x] [Review][Patch] — applied 2026-09-04: Add JobCard per-scope tests — upcoming date prefix, overdue "N days
      overdue" badge (singular/plural), history `completedAt` line and "Cancelled" literal;
      all JobCard tests render only the default today branch. [__tests__/JobCard.test.tsx]
- [x] [Review][Patch] — applied 2026-09-04: Add Home tile tests — press each stat tile and assert
      `navigate('Jobs', { scope })`; also assert the rendered tile VALUES (the updated
      assertion checks the labels Today/Upcoming/Overdue but not the counts).
      [__tests__/home-screen.test.tsx]
- [x] [Review][Patch] — applied 2026-09-04: Add a hook `setFilter` test — it re-anchored to the current scope
      (`loadJobs(undefined, next)`); no test calls it, so a wrong literal in the scope slot
      would silently switch the tab. [__tests__/useJobs.test.ts]
- [x] [Review][Patch] — applied 2026-09-04: Restore the dropped `openMaps, openTel` re-export in the utils barrel —
      `src/utils/index.ts` replaced the linking re-exports with only the istDate exports;
      harmless today (the sole consumer imports `utils/linking` directly) but the public
      surface shrank in an unrelated way. Also fix the stale barrel header comment.
      [src/utils/index.ts:1-9]
- [x] [Review][Patch] — applied 2026-09-04: Rename the misleading upsert test — "upsertJob still prepends a
      cancelled-today job under the all filter" actually builds a yesterday-scheduled job and
      asserts it is NOT prepended (the IST day-guard case).
      [__tests__/useJobs.test.ts:386-395]
- [x] [Review][Patch] — applied 2026-09-04: Add missing trailing newlines — `ScopeSelector.tsx`, `hasAnyJobCount.ts`,
      `istDate.ts`, `istDate.test.ts`, `hasAnyJobCount.test.ts` end without one.
- [x] [Review][Patch] — applied 2026-09-04: Story record accuracy — the File List lists `users.ts` as modified by
      this story, but the `JobStatusCounts → JobCounts` rename landed in commit `8494500`
      (pre-story); the Change Log should carry the lint caveat (`lint` not runnable — no
      ESLint config, pre-existing). [1-5-jobs-timeline-scopes.md]
- [x] [Review][Patch] — applied 2026-09-04: StatCard accessibility label reads value-first — `` `${title}
      ${subtitle}` `` announces "3 Today"; subtitle-first ("Today 3") is the natural order.
      [src/components/HomeHeader.tsx:30]
- [x] [Review][Patch] — applied 2026-09-04: Document JobCard's completedAt-null history fallback — a completed
      history row with null `completedAt` silently shows the scheduled slot (unreachable via
      the current BE payloads; the behaviour deserves a comment beside the branch).
      [src/features/jobs/components/JobCard.tsx:62-69]
- [x] [Review][Patch] filterForScope doc-comment gap — says Today "keeps whatever chip is
      active", but a Today→Upcoming→Today round trip loses the chip (Upcoming forces `all`);
      note it. — **Resolved 2026-09-04** by the D1 fix: the rule now lives in
      `scopeFilters.ts`, whose doc comment covers the round-trip loss.
- [x] [Review][Defer] upsertJob row can be overwritten by an in-flight page-1 response
      (create → prepend → stale response lands) [src/features/jobs/useJobs.ts:230-236] —
      deferred, pre-existing (the race predates this story; the throttled focus refetch
      picks the created row up)
- [x] [Review][Defer] upsertJob IST-midnight boundary edge — a job confirmed right at the
      day boundary drops out of Today with no refetch trigger until next focus
      [src/features/jobs/useJobs.ts:231] — deferred, pre-existing pattern
- [x] [Review][Defer] `list()` sends `date` + a non-today scope unguarded (documented 422)
      [src/services/resources/jobs.ts:275-284] — deferred, pre-existing contract shape; the
      store never sends `date`, and the server validates

## Dev Notes

- **The BE contract in "API Contract" is authoritative** — it is what fenzit-be 3-7 ships.
  Cross-check against fenzit-be `_bmad-output/implementation-artifacts/3-7-jobs-timeline-scopes.md`
  if anything seems off; do not invent params the BE doesn't accept (`date` is 422 with any
  non-today scope).
- **Server sorts differ per scope** — the FE must NOT re-sort client-side, which is exactly why
  `upsertJob` is today-only (AC #7): there is no correct client-side insert position for the
  `scheduled_start`-sorted scopes without re-sorting, and prepending would be wrong. The
  throttled focus refetch is the freshness mechanism for those scopes.
- **Tiles are action counts; lists are full views.** `jobCounts.today` deliberately excludes
  completed/cancelled jobs while the Jobs-tab Today list shows all statuses via chips — the
  tile "2" next to a Today list showing 5 rows is CORRECT (BE 3-7 AC9), not a bug. Do not
  "fix" one to match the other.
- **The shared-store pattern is load-bearing**: keep `useSyncExternalStore` semantics (stable
  snapshot references), the `resetGen` stale-response guard, and the "failed refresh keeps
  prior rows" rule. Extending state is fine; do not restructure the store in this story.
- **Design system**: the scope selector extends `@components/ui` (mirror `StatusFilterBar`'s
  accessibility pattern). An "N days overdue" marker must be a *neutral/attention* treatment,
  NOT a new status badge colour competing with Done/In Progress/Scheduled/Cancelled.
- **No date library** — build the IST util by hand (see Task 3 for why the existing formatters
  can't be reused). `@utils` is the home, with re-export from `src/utils/index.ts`.
- **Imports: use RELATIVE paths in this story, matching every existing file in the repo.**
  CLAUDE.md's absolute-imports mandate is aspirational but NOT backed by working tooling here:
  `tsconfig.json` maps only wildcard aliases (`@utils/*` — a bare `import … from '@utils'`
  does not resolve), `jest.config.js` has no `moduleNameMapper` (alias imports fail test
  resolution), and the entire existing `src/` uses relative imports. Do not add tooling in
  this story; match the surrounding code (`./components/JobCard`, `../../services/...`).
- **Technician app screens are verified unaffected by the profile shape change** (no
  `jobStatusCounts` usage in `features/more|technicianApp|technicians|profile`). BUT the
  `JobCard` scope prop touches two technician call sites — `TodayScreen.tsx:47` and
  `HistoryScreen.tsx:36` — which is why the prop is OPTIONAL defaulting to today's rendering
  (Task 3). Those two screens must end byte-identical; no hedge work beyond keeping the prop
  optional.

### Project Structure Notes

- Files modified: `src/services/resources/users.ts`, `jobs.ts`, `resources/index.ts`,
  `src/features/jobs/useJobs.ts`, `types.ts`, `JobsScreen.tsx`, `components/JobCard.tsx`,
  `components/StatusFilterBar.tsx`, `src/screens/HomeScreen.tsx`, `src/components/HomeHeader.tsx`,
  `src/features/home/components/QuickActions.tsx`, `src/navigation/types.ts`,
  new util + re-export in `src/utils/`, new `@components/ui` scope selector.
- No new dependencies (IST date math hand-built per Task 3; no date-fns/dayjs).
- `baseline_commit` at story creation: HEAD of `fenzo-app` main.

### References

- [Source: fenzo-app/src/features/jobs/useJobs.ts] store internals (throttle, resetGen, upsert)
- [Source: fenzo-app/src/features/jobs/JobsScreen.tsx:49-72] EMPTY_BY_FILTER
- [Source: fenzo-app/src/features/jobs/types.ts:11] JobFilter union
- [Source: fenzo-app/src/features/jobs/components/StatusFilterBar.tsx:20-26] hardcoded chip list
- [Source: fenzo-app/src/features/jobs/components/JobCard.tsx:77-80] scheduled-time meta row
- [Source: fenzo-app/src/services/resources/users.ts:47-52,88-107] JobStatusCounts/MyProfile
- [Source: fenzo-app/src/services/resources/jobs.ts:77,171-182,206-213] ApiJob/ListJobsQuery/list
- [Source: fenzo-app/src/screens/HomeScreen.tsx:102-113] totalJobs + isSetupComplete
- [Source: fenzo-app/src/components/HomeHeader.tsx:5,62-63,77-83,113-135] tiles + local totalJobs
- [Source: fenzo-app/src/features/home/components/QuickActions.tsx:65-76] "All jobs" tile
- [Source: fenzo-app/src/navigation/types.ts:11-16, src/navigation/MainTabs.tsx:26] Jobs tab registration
- [Source: fenzo-app/src/features/customers/format.ts:44-52] Hermes Intl caveat + device-TZ risk
- [Source: fenzo-app/_bmad-output/implementation-artifacts/1-1-wire-jobs-list-to-get-jobs.md] Jobs tab baseline
- [Source: fenzo-app/_bmad-output/implementation-artifacts/1-4-home-stats-refresh.md] throttle/focus machinery to preserve
- [Source: fenzit-be/_bmad-output/implementation-artifacts/3-7-jobs-timeline-scopes.md] the BE contract
- [Source: fenzo-app/CLAUDE.md] extend-tokens-first rule; absolute imports

## Dev Agent Record

### Agent Model Used

Claude Code (glm 5.3-flash), bmad-dev-story workflow, 2026-09-04.

### Debug Log References

- Sandbox blocked Watchman (`fchmod … Operation not permitted` → jest never
  started); worked around with jest's own `--watchman=false` flag (no config
  change, no host access) — all runs used `bun run test -- --watchman=false`.
- `bun run lint` is not runnable in this repo (no ESLint config — pre-existing
  condition, same as story 1-4). Validated with `bunx tsc --noEmit` (clean) and
  the full jest suite instead.
- One test fixed mid-run: `probe?.nextCursor` was `undefined` because the hook
  does not expose `nextCursor` — the test now asserts the observable signal
  (`hasMore === false`) instead. `home-screen.test.tsx`'s feature mock gained
  `hasAnyJobCount` (requireActual) and its stats assertion moved from the
  removed totalJobs/details line to the four tile labels.

### Completion Notes List

- Implementation follows the story tasks in order: services (JobCounts rename +
  `completedAt` + `scope` query), store scope dimension, Jobs tab UI (new
  `ScopeSelector` chip row mirroring `StatusFilterBar`, chips visible only in
  Today/History with History's three-chip subset, scope-aware empty states,
  per-scope JobCard meta row), Home tiles (Today/Upcoming/Overdue + Technicians,
  pressable StatCards → `navigate('Jobs', { scope })`, `hasAnyJobCount`
  extraction, "All jobs" → "Today's jobs"), then tests.
- `upsertJob` keeps the filter guard and adds the today-scope + IST day guard;
  prepending stays a no-op in every other scope so the server's per-scope sorts
  are never violated client-side.
- The scope nav param is consumed-then-cleared inside JobsScreen's
  `useFocusEffect` (apply when different from the store, then
  `setParams({ scope: undefined })`, then the focus `loadJobs()`) — AC #10.
- `src/utils/istDate.ts` is hand-built (+5:30 shift, UTC-field reads, no Intl,
  no date library) with injectable `nowIso` on every function; tests pin
  `2026-09-04T04:00:00Z` (09:30 IST) and prove the 18:30Z day boundary.
- Technician screens (`TodayScreen`, `HistoryScreen`) still render `<JobCard
  job={item} onPress={…} />` with no scope prop → default 'today' renders
  byte-identical to before this story.
- Full suite: 19 suites / 179 tests pass; `tsc --noEmit` clean. `lint` skipped
  (pre-existing missing ESLint config — see Debug Log).

### File List

- src/services/resources/jobs.ts (modified — JobScope, completedAt, scope query)
- src/services/resources/index.ts (modified — re-exports)
- src/features/jobs/types.ts (modified — JobScope re-export)
- src/features/jobs/useJobs.ts (modified — scope dimension, upsert guards, setScope rule)
- src/features/jobs/scopeFilters.ts (new — shared scope→chip rule, from code review)
- src/features/jobs/JobsScreen.tsx (modified — scope selector, param consume-clear, empty states)
- src/features/jobs/components/JobCard.tsx (modified — optional scope prop, per-scope meta row)
- src/features/jobs/components/StatusFilterBar.tsx (modified — optional filters subset prop)
- src/utils/istDate.ts (new)
- src/utils/index.ts (modified — re-exports)
- src/components/ui/ScopeSelector.tsx (new)
- src/components/ui/index.ts (modified — re-export)
- src/navigation/types.ts (modified — Jobs param)
- src/features/home/hasAnyJobCount.ts (new)
- src/features/home/index.ts (modified — re-export)
- src/features/home/components/QuickActions.tsx (modified — "Today's jobs")
- src/components/HomeHeader.tsx (modified — tiles, pressable StatCard, neutral overdue palette)
- src/screens/HomeScreen.tsx (modified — tile press, Today quick action scope param)
- __tests__/useJobs.test.ts (modified — new scope API + new tests)
- __tests__/scopeFilters.test.ts (new — shared scope→chip rule)
- __tests__/istDate.test.ts (new)
- __tests__/hasAnyJobCount.test.ts (new)
- __tests__/jobs-service.test.ts (modified — scope passthrough tests, fixtures)
- __tests__/JobsScreen.test.tsx (modified — route stub, param shapes, fixtures, scope tests)
- __tests__/JobCard.test.tsx (modified — completedAt fixture, per-scope tests)
- __tests__/edit-job-sheet.test.tsx (modified — completedAt fixture)
- __tests__/job-detail-screen.test.tsx (modified — completedAt fixture)
- __tests__/home-screen.test.tsx (modified — mock, tile press/value tests)
- src/features/jobDetail/editJobModel.test.ts (modified — completedAt fixture)

Note: `src/services/resources/users.ts` is NOT part of this story's diff —
the `JobStatusCounts → JobCounts` rename landed in commit `8494500`
(pre-story). The tasks section's reference to it is that commit's context.

## Change Log

- 2026-09-04: Story 1-5 implemented per Tasks 1–5 (services, store, Jobs tab
  UI, Home tiles, tests). Suite 179/179 green, tsc clean. Status → review.
- 2026-09-04: Code review (bmad-code-review) — 3 decisions resolved
  (setScope aligned with the shared scope→chip rule via new
  `scopeFilters.ts`; overdue tile → neutral palette; StatCard pressed
  opacity) + 10 patches applied (Home "Today's jobs" tile scope param;
  route-param/scope-switch/JobCard-per-scope/Home-tile/setFilter tests;
  utils barrel re-export restored; misleading test renamed; trailing
  newlines; JobCard fallback comment; a11y label order; this record).
  3 items deferred (see deferred-work.md). Suite 200/200 green, tsc clean.
  `bun run lint` is NOT a real gate in this repo — no ESLint config
  exists (pre-existing); validation used tsc + jest throughout.