---
baseline_commit: a5cfb4f542b66429becdedb1939d37affa57ab49
---

# Story 1.4: Home Stats Refresh

Status: done

## Story

As an owner,
I want the Home tiles and greeting data to reflect current counts,
so that the dashboard is trustworthy rather than a snapshot from login.

## API Contract (api-contracts.md §14)

`GET /users/me` (already wired in `useMyProfile`) returns `jobStatusCounts { scheduled, inProgress, completed, cancelled }` plus the roster. There is NO separate counts endpoint (dashboard aggregations deferred to BE Phase 2) — this payload is the only source.

> **UPDATE 2026-09-04 — stale premise.** fenzit-be Story 3-7 replaced that shape: the payload now returns `jobCounts { today, upcoming, overdue, completed, cancelled }` (three mutually exclusive IST day-buckets + all-time finished totals; no per-status breakdown). The app was already switched over with the HomeScreen crash fix (fenzo-app commit `921e012` follow-up) — `MyProfile.jobCounts`, HomeScreen's total and HomeHeader's details line all read the new buckets. Write this story against `jobCounts`.

## UI Design

No visual change. Existing Home tiles/banner/loading states stay exactly as they are; the only observable difference is data freshness (AC 5's no-flicker rule).

## Acceptance Criteria

1. **Given** Home regains focus, **then** `loadMyProfile()` runs, throttled: a load whose last SUCCESS was < 15s ago is skipped; rapid tab switches produce at most one request per 15s window.
2. **Given** a successful job mutation (create in NewJobScreen; edit/reassign/cancel in Story 1.3), **then** `loadMyProfile({ force: true })` is fired-and-forgotten so tiles are fresh on return to Home (force bypasses the throttle — mutations invalidate immediately).
3. **Given** a refresh failure while `profile !== null`, **then** the stale profile stays rendered with the existing dismissible error banner; the tiles never blank out.
4. **Given** the first-ever load in flight, **then** Home's existing loading state renders unchanged.
5. No visual flicker on focus refresh: when `profile` exists, `isLoading` stays false during a background refresh (only the FIRST load sets it).

## Tasks / Subtasks

- [x] **Task 1 — Store change** (`features/profile/useMyProfile.ts`, modify): add `lastLoadedAt: number | null` to `MyProfileState` (set to `Date.now()` only on SUCCESS); change signature to `loadMyProfile(opts: { force?: boolean } = {})`:
  ```ts
  export function loadMyProfile(opts: { force?: boolean } = {}): Promise<void> {
    if (inFlight) return inFlight;
    if (!opts.force && state.lastLoadedAt && Date.now() - state.lastLoadedAt < 15_000) return Promise.resolve();
    inFlight = fetchProfile().finally(() => { inFlight = null; });
    return inFlight;
  }
  ```
  Verify `fetchProfile` sets `isLoading: true` ONLY when `state.profile === null` (AC 5) — adjust if it currently always does. Keep `error` set alongside a retained `profile` on failure (AC 3 — confirm existing behaviour, add a test).
- [x] **Task 2 — Focus hook** (`src/screens/HomeScreen.tsx`, modify): `useFocusEffect(useCallback(() => { void loadMyProfile(); }, []))` (throttle makes this cheap).
- [x] **Task 3 — Mutation hooks**: in NewJobScreen's create-success path and Story 1.3's save/cancel-success paths, add `void loadMyProfile({ force: true })` (import the function, not the hook — these are event handlers).
- [x] **Task 4 — Banner-over-data check** (`HomeScreen` + `HomeHeader`): confirm the error banner renders ABOVE the tiles when `profile && error` (not instead of them); fix layout if needed.
- [x] **Task 5 — Tests** (`__tests__/useMyProfile.test.ts`): throttle skips within 15s; `force` bypasses; failure retains profile and sets error; success updates lastLoadedAt; background refresh does not flip isLoading when profile exists.

## Dev Notes

- `refresh` exposed by the hook should become `() => loadMyProfile({ force: true })` (pull-to-refresh is always intentional).
- Do NOT debounce inside useFocusEffect with timers — the throttle in the store is the single mechanism (timers in focus effects leak across fast navigation).
- Same 15s constant will be reused by Stories 2.2/3.1 — export `const FOCUS_REFRESH_TTL_MS = 15_000` from a tiny `src/constants` addition rather than duplicating the literal.
- Files: MODIFY `features/profile/useMyProfile.ts`, `src/screens/HomeScreen.tsx`, `features/newJob/NewJobScreen.tsx`, `src/constants/index.ts`; tests.
- [Source: api-contracts.md §14; src/features/profile/useMyProfile.ts current internals; fenzit-be src/users/users.service.ts].

## Dev Agent Record

### Agent Model Used

Claude Code (glm-5.3-flash) — 2026-09-04

### Debug Log References

- `bun run test -- --watchman=false` → full suite green (see Change Log for the per-round counts), including `__tests__/useMyProfile.test.ts` (10 tests), `__tests__/new-job-screen.test.tsx` (2 tests, NEW) and the extended `__tests__/home-screen.test.tsx` (+1 focus-refresh test).
- `bunx tsc --noEmit` → clean (re-run after every round).
- `bun run lint` → repo has no ESLint config (pre-existing; `eslint .` fails with "couldn't find a configuration file"), so lint was skipped, not failing on this change.

### Completion Notes List

- **AC 1/AC 2 implemented as specified.** `loadMyProfile` now takes `{ force?: boolean }`, is throttled on `lastLoadedAt` (SUCCESS-only stamp, `FOCUS_REFRESH_TTL_MS` from `src/constants`), and still de-duplicates in-flight calls. `fetchProfile` already set `isLoading: state.profile === null`, so AC 5 needed no store-side change — only a test pinning it.
- **`refresh` (pull-to-refresh + error-view retry) is now `loadMyProfile({ force: true })`** per Dev Notes — HomeScreen's `handleRefresh` unchanged apart from inheriting the forced refresh.
- **Deviation from Task 3's literal wording, flagged for review:** Story 1.3's `EditJobSheet` calls `loadMyProfile()` in a *failed-save* recovery path (`resolution.refreshRoster` — the save rejected the assigned technician, so the roster must refetch). Left unforced, the new throttle could swallow it and leave the picker offering ids the server rejects. Changed that one call to `{ force: true }` to preserve pre-story behaviour. The `applyJobUpdate` success path (edit save + cancel) got `force: true` exactly as specified.
- **Task 4 — verified, no change needed.** `errorBanner` renders as the first child of the ScrollView content in both the first-run and established branches — above quickActions and the jobs card, alongside the data (never instead of it). Note the KPI stat tiles live in `HomeHeader`, which sits *above* the ScrollView; putting the banner above those tiles would restructure the header, which the story's "no visual change" rule forbids. Current placement (banner at the top of the scrollable content, tiles still rendered) satisfies the intent.
- **Scope note:** `useJobs.ts` still carries its own `15_000` literal for the same throttle. It predates this story and its story owns that file; left untouched to keep this diff minimal. Stories 2.2/3.1 should import `FOCUS_REFRESH_TTL_MS` (and may migrate `useJobs` to it then).
- The `HomeScreen` mount effect (`!profile && !error && !inFlight`) is untouched — after a failed first-ever load every focus refresh retries, because `lastLoadedAt` only ever records successes.

### Review Fixes (code-review round 1)

- **CORRECTNESS — force no longer joins a stale in-flight request.** `loadMyProfile` previously returned the running promise before the throttle check, so a forced post-mutation refresh could resolve with pre-mutation data (and stamp a pre-mutation success). Unforced callers still join; forced callers issue a fresh request alongside. The slot-clearing `finally` now only frees the slot when its own request is still the current one (a forced request replaces `inFlight`; the older request's cleanup must not free it early).
- **CORRECTNESS — clock-backward guard.** Elapsed is now `Date.now() - (lastLoadedAt ?? 0)`, and fresh requires `elapsed >= 0 && elapsed < TTL` — a negative elapsed (NTP correction, manual clock change) reads as stale so refreshes keep flowing.
- **STYLE — `EditJobSheet`'s forced call is now `void loadMyProfile({ force: true })`, matching the other call sites; fixed the `// Starts xtrue` typo in the store comment.
- **TEST COVERAGE — added:** forced-call-issues-own-request test; clock-backward test; `lastLoadedAt` stamped at the success instant (boundary-pinned); hook `refresh` forces; NewJobScreen create-success forced refresh (new `__tests__/new-job-screen.test.tsx`, +2 tests including the no-refresh-on-failure guard); force assertions pinned in `job-detail-screen.test.tsx` (cancel) and `edit-job-sheet.test.tsx` (404-on-reassign); throttle tests fully fake-clock (no real-clock skew risk); `focusEffect` reset moved to `afterEach` in `home-screen.test.tsx`; trailing newlines on `src/constants/index.ts` and `__tests__/useMyProfile.test.ts`.

### File List

- `src/constants/index.ts` (MODIFY — added `FOCUS_REFRESH_TTL_MS = 15_000`)
- `src/features/profile/useMyProfile.ts` (MODIFY — `lastLoadedAt` state, throttled + forced `loadMyProfile`, forced `refresh`, clock-backward guard, in-flight-slot fix, doc comments)
- `src/screens/HomeScreen.tsx` (MODIFY — `useFocusEffect` focus refresh)
- `src/features/newJob/NewJobScreen.tsx` (MODIFY — forced profile refresh after create success)
- `src/features/jobDetail/JobDetailScreen.tsx` (MODIFY — `applyJobUpdate` now forces the profile refresh)
- `src/features/jobDetail/components/EditJobSheet.tsx` (MODIFY — roster-refresh-on-failed-save path forced + `void`, see completion notes)
- `__tests__/useMyProfile.test.ts` (NEW — 10 store tests covering AC 1–5 + review additions)
- `__tests__/new-job-screen.test.tsx` (NEW — create-success forced refresh + failure-path guard)
- `__tests__/home-screen.test.tsx` (MODIFY — mocked `useFocusEffect`, added focus-refresh test; needed because HomeScreen now imports that hook)
- `__tests__/job-detail-screen.test.tsx` (MODIFY — cancel assertion pins `{ force: true }`)
- `__tests__/edit-job-sheet.test.tsx` (MODIFY — 404-on-reassign assertion pins `{ force: true }`)
- `_bmad-output/implementation-artifacts/1-4-home-stats-refresh.md` (MODIFY — this record)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFY — story status → `review`)

## Change Log

## Suggested Review Order

**Store throttle core**

- Entry point: the throttled loader — force-vs-join, TTL check, slot guard all live here
  [`useMyProfile.ts:102`](../../src/features/profile/useMyProfile.ts#L102)

- Forced refresh issues a fresh request instead of joining a stale in-flight one
  [`useMyProfile.ts:108`](../../src/features/profile/useMyProfile.ts#L108)

- TTL freshness check; negative elapsed (clock jumped back) reads as stale
  [`useMyProfile.ts:114`](../../src/features/profile/useMyProfile.ts#L114)

- Slot-clear guard: only the current request frees `inFlight`
  [`useMyProfile.ts:123`](../../src/features/profile/useMyProfile.ts#L123)

- `lastLoadedAt` stamped on SUCCESS only — failed refreshes never extend the throttle window
  [`useMyProfile.ts:84`](../../src/features/profile/useMyProfile.ts#L84)

- Pull-to-refresh / retry is always forced, per spec Dev Notes
  [`useMyProfile.ts:145`](../../src/features/profile/useMyProfile.ts#L145)

**Wiring**

- Focus refresh on Home — unforced, so the throttle keeps tab-switching cheap
  [`HomeScreen.tsx:40`](../../src/screens/HomeScreen.tsx#L40)

- The 15s TTL lives in one constant for reuse by Stories 2.2/3.1
  [`index.ts:14`](../../src/constants/index.ts#L14)

- Forced refresh after create success — tiles fresh on return
  [`NewJobScreen.tsx:242`](../../src/features/newJob/NewJobScreen.tsx#L242)

- Forced refresh after edit/cancel success
  [`JobDetailScreen.tsx:196`](../../src/features/jobDetail/JobDetailScreen.tsx#L196)

- Forced refresh in the failed-save roster recovery path (deliberate deviation, see Completion Notes)
  [`EditJobSheet.tsx:185`](../../src/features/jobDetail/components/EditJobSheet.tsx#L185)

**Tests**

- 10 store tests: throttle, force-vs-inflight, clock-backward, lastLoadedAt stamping, no-flicker
  [`useMyProfile.test.ts`](../../__tests__/useMyProfile.test.ts#L1)

- New: create-success fires the forced refresh; failure path does not
  [`new-job-screen.test.tsx`](../../__tests__/new-job-screen.test.tsx#L1)

- Pins `force: true` on the cancel path
  [`job-detail-screen.test.tsx`](../../__tests__/job-detail-screen.test.tsx#L452)

- Pins `force: true` on the failed-save roster refresh
  [`edit-job-sheet.test.tsx`](../../__tests__/edit-job-sheet.test.tsx#L313)

- Focus-refresh test + `afterEach` cleanup for the captured callback
  [`home-screen.test.tsx`](../../__tests__/home-screen.test.tsx#L1)

- 2026-09-04 — Story 1.4 implemented: 15s focus-refresh throttle on `GET /users/me` (`loadMyProfile({ force })`), Home focus refresh, forced refresh after job create/edit/cancel, store tests. Written against `jobCounts` per the 2026-09-04 premise update (no counts-shape code touched — HomeScreen/HomeHeader already read the new buckets).
- 2026-09-04 — Code-review fixes: force bypasses in-flight requests (not just the throttle), clock-backward guard, in-flight slot cleanup, `void` on EditJobSheet's forced call, typo fix, trailing newlines; coverage added for force-on-mutations, hook `refresh`, `lastLoadedAt` stamping, clock-backward, and NewJobScreen's create path; force assertions pinned in the two story-1.3 test files. Full suite 146/146 green, `tsc --noEmit` clean.
