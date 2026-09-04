# Story 1.5: Jobs Timeline Scopes

Status: ready-for-dev

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

- [ ] **Task 1 — Services layer** (AC: #1)
  - [ ] `src/services/resources/users.ts`: `JobCounts` interface replaces `JobStatusCounts`
        (`:47-52`); `MyProfile.jobCounts` (`:106`); update the barrel re-export in
        `src/services/resources/index.ts:39`.
  - [ ] `src/services/resources/jobs.ts`: `ApiJob.completedAt` (`:77` block), `scope` on
        `ListJobsQuery` (`:171-182`), passed through `list()`'s param serialization
        (`:206-213`).
  - [ ] Grep-verify: no `jobStatusCounts`/`JobStatusCounts` references remain.

- [ ] **Task 2 — `useJobs` store: scope dimension** (AC: #6, #7, #11)
  - [ ] `src/features/jobs/useJobs.ts`: add `scope: JobScope` to `JobsState` + `INITIAL`
        (default `'today'`); `JobScope` type in `src/features/jobs/types.ts` next to `JobFilter`.
  - [ ] `loadJobs(scope, filter, opts)`: throttle/in-flight keys become `(scope, filter)`;
        a scope change mirrors the existing `changedFilter` handling at `:116-148` exactly
        (loading state over old rows, drop prior cursor, failure branch clears rows/cursor —
        do NOT clear rows eagerly before the request). Keep the request-queueing semantics
        intact — a scope switch queued behind an in-flight page-2 fetch must not be swallowed.
  - [ ] Update the `refresh` callback (`useJobs.ts:229`) — with the new signature its current
        `{ force: true }` second arg lands in the `filter` slot; it must become
        `loadJobs(state.scope, state.filter, { force: true })`.
  - [ ] `loadMoreJobs` sends `scope: state.scope` with the cursor (`:170`).
  - [ ] `upsertJob` (`:201-206`): KEEP the existing `filterToStatuses` filter-skip logic and
        ADD the scope guard on top — prepend only when `state.scope === 'today'` AND the job
        computes to today (IST) AND the filter allows the status (AC #7). No-op otherwise.
  - [ ] `useJobs()` hook: expose `scope` + `setScope` (mirrors `setFilter`); mount effect and
        focus-refetch unchanged.

- [ ] **Task 3 — Jobs tab UI** (AC: #2, #3, #4, #5)
  - [ ] New IST-aware date util in `src/utils/` (day diff for "N days overdue" + a date label
        for Upcoming rows). It must take an injectable `nowIso` (or today-start) parameter so
        tests don't depend on the host machine's timezone/clock (jest runs in host TZ, not
        IST). **No date utils exist today** — `src/utils/` only re-exports `linking.ts`; time
        formatting lives scattered in features
        (`features/jobs/format.ts`, `features/customers/format.ts`,
        `features/jobDetail/JobDetailScreen.tsx`, `features/newJob/components/DateTimeFields.tsx`)
        and is device-TZ-naive (`toLocaleTimeString('en-IN', …)` is a locale, not a timezone),
        with Hermes shipping incomplete Intl (see comments in `customers/format.ts:44-46`).
        Build the util by hand in the same spirit; do NOT reuse those helpers for day math.
  - [ ] `src/features/jobs/JobsScreen.tsx`: scope selector above the chip row. No segmented
        control exists in `@components/ui` — build one mirroring `StatusFilterBar`'s chip row
        pattern (`Pressable` + `accessibilityRole` + `accessibilityState.selected`), tokenized
        per DESIGN_SYSTEM.md. Default Today. Also: read the `scope` nav param via `route`
        (the screen currently destructures only `navigation`, `JobsScreen.tsx:83`) and
        implement AC #10's consume-then-clear here (`navigation.setParams({ scope: undefined })`
        before the focus refetch inside `useFocusEffect`).
  - [ ] Chips: visible only in Today (all five) and History (All/Done/Cancelled); hidden in
        Upcoming/Overdue. `StatusFilterBar` hardcodes its filter list — add a subset prop.
        `EMPTY_BY_FILTER` becomes scope-aware (scope × chip matrix).
  - [ ] `JobCard` (`./components/JobCard.tsx`): add an **optional** `scope` prop that defaults
        to today's current time-only rendering. `src/features/technicianApp/TodayScreen.tsx:47`
        and `src/features/technicianApp/HistoryScreen.tsx:36` render `<JobCard job={item}
        onPress={...} />` with no scope — they pass nothing and MUST render byte-identical to
        today. Per-scope content goes in the scheduled-time meta row (the `formatTimeLabel`
        row) — Upcoming: scheduled date (needs the new date label util; JobCard shows times
        only today); Overdue: "N days overdue" badge; History: `completedAt`/Cancelled.
  - [ ] Focus-refetch, pagination, pull-to-refresh flows unchanged (store handles them).

- [ ] **Task 4 — Home dashboard tiles** (AC: #8, #9, #10)
  - [ ] `src/screens/HomeScreen.tsx`: `isSetupComplete` (`:113`) keeps the `hasTechnicians`
        conjunct and gains the extracted `hasAnyJobCount(jobCounts)` pure helper (AC #9);
        remove the `totalJobs` sum (`:102-107`); pass `jobCounts` + `onTilePress(scope)` to
        `HomeHeader`. Extend `MainTabParamList`'s `Jobs` entry in `navigation/types.ts:11-16`
        to `Jobs: { scope?: JobScope } | undefined` (flat param shape, NOT double-nested
        `params?: {…}` — idiomatic React Navigation gives `route.params?.scope` without an
        extra `.params` hop). The param is consumed/cleared in JobsScreen per Task 3/AC #10.
  - [ ] `src/components/HomeHeader.tsx`: tiles become Today/Upcoming/Overdue + Technicians,
        two rows (`StatCard` usages `:116-133`, local `totalJobs` `:79-83`, `JobStatusCounts`
        import/prop `:5,63`, and the "Deliberately labeled Jobs" comment `:77-78` all go);
        make `StatCard` pressable (`Pressable`, ≥44px target).
  - [ ] `src/features/home/components/QuickActions.tsx:65-76`: its "All jobs" tile currently
        navigates to `Jobs` with no params — with the all-time view gone it silently becomes
        "Today". Relabel to "Today's jobs" (jumping to Today) — decided; don't invent a new
        all-time view. Also rename the `onAllJobs` prop (`:21,65`) to `onTodayJobs` so the
        name doesn't outlive its meaning.
  - [ ] Keep 1-4's throttle/focus behaviour untouched — this story only changes what the tiles
        display and where they navigate.

- [ ] **Task 5 — Tests** (AC: #12)
  - [ ] `useJobs` store tests: scope change behaves like the changed-filter path (old rows
        never render under the new scope, prior cursor dropped, failure clears rows); throttle
        keyed per (scope, filter); `upsertJob` today+filter restriction (scope guard AND filter
        guard).
  - [ ] Update `__tests__/useJobs.test.ts` — it pins the OLD shapes/behaviour and WILL fail:
        `:109` `toHaveBeenLastCalledWith({ status: ['completed'] })`, `:127`, `:140`, `:191`
        (cursor-only param shapes) gain `scope`; `:230-247` pins the exact filter-skip behaviour
        Task 2 extends — rewrite the upsert tests for the scope+filter rule.
  - [ ] Update `__tests__/JobsScreen.test.tsx:240` (pins `{ cursor: 'cursor-1' }` param shape)
        and stub the `route` param the screen now reads.
  - [ ] New IST util tests (same-day is not overdue; IST boundary; date label) — util takes
        injectable `nowIso`, tests pass fixed timestamps.
  - [ ] Extracted `hasAnyJobCount` helper test.
  - [ ] Update `__tests__/jobs-service.test.ts` param assertions for the `scope` passthrough
        (`:21-24` pins `params: {}` today).
  - [ ] `bun run lint` + tests green.

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

### Debug Log References

### Completion Notes List

### File List