# Story 1.4: Home Stats Refresh

Status: ready-for-dev

## Story

As an owner,
I want the Home tiles and greeting data to reflect current counts,
so that the dashboard is trustworthy rather than a snapshot from login.

## API Contract (api-contracts.md §14)

`GET /users/me` (already wired in `useMyProfile`) returns `jobStatusCounts { scheduled, inProgress, completed, cancelled }` plus the roster. There is NO separate counts endpoint (dashboard aggregations deferred to BE Phase 2) — this payload is the only source.

## UI Design

No visual change. Existing Home tiles/banner/loading states stay exactly as they are; the only observable difference is data freshness (AC 5's no-flicker rule).

## Acceptance Criteria

1. **Given** Home regains focus, **then** `loadMyProfile()` runs, throttled: a load whose last SUCCESS was < 15s ago is skipped; rapid tab switches produce at most one request per 15s window.
2. **Given** a successful job mutation (create in NewJobScreen; edit/reassign/cancel in Story 1.3), **then** `loadMyProfile({ force: true })` is fired-and-forgotten so tiles are fresh on return to Home (force bypasses the throttle — mutations invalidate immediately).
3. **Given** a refresh failure while `profile !== null`, **then** the stale profile stays rendered with the existing dismissible error banner; the tiles never blank out.
4. **Given** the first-ever load in flight, **then** Home's existing loading state renders unchanged.
5. No visual flicker on focus refresh: when `profile` exists, `isLoading` stays false during a background refresh (only the FIRST load sets it).

## Tasks / Subtasks

- [ ] **Task 1 — Store change** (`features/profile/useMyProfile.ts`, modify): add `lastLoadedAt: number | null` to `MyProfileState` (set to `Date.now()` only on SUCCESS); change signature to `loadMyProfile(opts: { force?: boolean } = {})`:
  ```ts
  export function loadMyProfile(opts: { force?: boolean } = {}): Promise<void> {
    if (inFlight) return inFlight;
    if (!opts.force && state.lastLoadedAt && Date.now() - state.lastLoadedAt < 15_000) return Promise.resolve();
    inFlight = fetchProfile().finally(() => { inFlight = null; });
    return inFlight;
  }
  ```
  Verify `fetchProfile` sets `isLoading: true` ONLY when `state.profile === null` (AC 5) — adjust if it currently always does. Keep `error` set alongside a retained `profile` on failure (AC 3 — confirm existing behaviour, add a test).
- [ ] **Task 2 — Focus hook** (`src/screens/HomeScreen.tsx`, modify): `useFocusEffect(useCallback(() => { void loadMyProfile(); }, []))` (throttle makes this cheap).
- [ ] **Task 3 — Mutation hooks**: in NewJobScreen's create-success path and Story 1.3's save/cancel-success paths, add `void loadMyProfile({ force: true })` (import the function, not the hook — these are event handlers).
- [ ] **Task 4 — Banner-over-data check** (`HomeScreen` + `HomeHeader`): confirm the error banner renders ABOVE the tiles when `profile && error` (not instead of them); fix layout if needed.
- [ ] **Task 5 — Tests** (`__tests__/useMyProfile.test.ts`): throttle skips within 15s; `force` bypasses; failure retains profile and sets error; success updates lastLoadedAt; background refresh does not flip isLoading when profile exists.

## Dev Notes

- `refresh` exposed by the hook should become `() => loadMyProfile({ force: true })` (pull-to-refresh is always intentional).
- Do NOT debounce inside useFocusEffect with timers — the throttle in the store is the single mechanism (timers in focus effects leak across fast navigation).
- Same 15s constant will be reused by Stories 2.2/3.1 — export `const FOCUS_REFRESH_TTL_MS = 15_000` from a tiny `src/constants` addition rather than duplicating the literal.
- Files: MODIFY `features/profile/useMyProfile.ts`, `src/screens/HomeScreen.tsx`, `features/newJob/NewJobScreen.tsx`, `src/constants/index.ts`; tests.
- [Source: api-contracts.md §14; src/features/profile/useMyProfile.ts current internals; fenzit-be src/users/users.service.ts].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
