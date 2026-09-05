---
baseline_commit: 22407b3899b90c93e8fa8001846a44bc28269622
---

# Story 1.7: Home — Today & needs attention section

Status: review

## Story

As an owner,
I want Home to show today's dispatched jobs and any overdue work,
so that I can run the whole day — see who goes where, spot problems, assign stragglers — from one screen.

## Design Contract (authoritative)

- [Source: artifacts/planning-artifacts/ux-designs/ux-Fenzo-2026-09-05-home-todays-jobs/DESIGN.md] — visual: OverdueStrip, TodayJobCard, empty state.
- [Source: artifacts/planning-artifacts/ux-designs/ux-Fenzo-2026-09-05-home-todays-jobs/EXPERIENCE.md] — behaviour, states, copy, key flows.
- [Source: mockups/key-home-todays-jobs.html (same folder)] — 1:1 visual reference (three columns: canonical / unassigned / empty). Spines win on conflict.
- All tokens/components from `src/theme` + `src/components/ui` — zero hard-coded values (DESIGN_SYSTEM.md).

**Depends on fenzit-be 3-9** (`jobsScope=today` + embedded customer/technician on profile job rows). BE merges/deploys FIRST (additive). FE must not assume the embed exists until that ships — but since this repo deploys after, code against the new shape directly (no feature flag).

## Acceptance Criteria

1. **Given** the established-account Home (setup complete), **then** the static "Nothing scheduled today" card is replaced by the "Today & needs attention" section; the first-run branch (no technician or no jobs) is untouched.
2. **Given** the profile store loads, **then** `GET /users/me` is called with `jobsScope=today` and the section renders one `JobCard` per job in `profile.jobs.data` with status `scheduled` or `in_progress`, sorted by `scheduledStart` ascending (undated sorts before timed jobs in the same slot); completed/cancelled jobs never render.
3. **Given** a job row, **then** the card resolves display data from the BE embed: `customerName` from `job.customer.name` (fallback `serviceTypeLabel`), `technicianName` from `job.technician.name` (fallback roster lookup, then neutral placeholder); urgent priority and status badges behave exactly as Jobs-tab JobCards.
4. **Given** a card press, **then** navigation goes to Owner Job Detail (`JobDetail: { jobId }`).
5. **Given** a job row, **then** the card footer renders Avatar + technician name from the embed (`technician.name`, fallback roster lookup). There is NO unassigned variant — `technician_id` is NOT NULL in the schema, so unassigned jobs cannot exist (decision 2026-09-05, recorded in the UX memlog); reassignment stays in Job Detail → edit sheet as today.
6. **Given** `jobCounts.overdue > 0`, **then** the `OverdueStrip` renders above the cards: one compact card, single row ≥ 44px — `AlertCircle` 18px in `colors.status.scheduled.fg`, "Overdue" `labelStrong`, the count as a soft chip (`status.scheduled.bg` bg / `fg` text), trailing `ChevronRight`; the whole strip is one press target navigating to `Jobs` with the one-shot `scope: 'overdue'` param (same pattern as the KPI tiles). Given `overdue === 0`, the strip is hidden, not disabled.
7. **Given** no today jobs AND `overdue === 0`, **then** the empty state renders (existing icon-badge anatomy): title "Nothing scheduled today", body "You're all clear. Overdue or upcoming work shows in the tiles above.", and a secondary Button "Create a job" → `NewJob` shown only when `technicianCount > 0`.
8. **Given** no today jobs but `overdue > 0`, **then** the section renders the strip alone (never fully empty). Given a refresh failure with an existing profile, the stale section stays usable under the existing dismissible `InlineError` banner (no blanking, no skeletons).
9. **Given** accessibility, **then** the strip exposes `accessibilityRole="button"` and `accessibilityLabel="Overdue, N jobs"`; all press targets ≥ 44px.
10. Tests cover: today-card filtering/sorting, strip visibility (0/N), strip-alone state, empty state with and without CTA, and card name resolution from the embed.

## Tasks / Subtasks

- [x] Task 1 — Type the profile payload (AC 2, 3): `src/services/resources/users.ts`
  - Define `ProfileTechnicianSummary` and `ProfileCustomerSummary` matching the BE embed shapes (EXPERIENCE.md Data Contract); define `ProfileJob = ApiJob & { technician: ProfileTechnicianSummary; customer: ProfileCustomerSummary }` (import `ApiJob` from the jobs resource — never re-declare it).
  - Change `MyProfile.jobs: Paginated<unknown>` → `Paginated<ProfileJob>`.
  - `getMe()` gains an optional `jobsScope?: 'today' | 'all'` param appended to the request.
- [x] Task 2 — Section component (AC 1, 2, 6-8): new `src/features/home/components/TodaysJobsSection.tsx` (one responsibility — receives today jobs, overdue count, technicianCount, and the callbacks: onPressJob, onPressStrip, onPressCreate). Keep it under the ~300-line/file limit; extract `OverdueStrip` into its own file in the same folder if it pushes the limit.
- [x] Task 3 — OverdueStrip (AC 6, 9): `AlertCircle` + label + soft count chip + `ChevronRight` in an interactive `Card`; `touch.min` height.
- [x] Task 4 — Empty state (AC 7): reuse the existing `noJobsCard` anatomy/styles from `HomeScreen` — move those styles into the new component (HomeScreen's copies go away with the old card); add the body line and the conditional secondary CTA.
- [x] Task 5 — HomeScreen wiring (AC 1-4): established branch renders `TodaysJobsSection` with `profile.jobCounts.overdue`, `profile.jobs.data`, `profile.technicianCount`; `handleTilePress`-style one-shot `scope` param for the strip; job press → `JobDetail`; `getMe` call gains `jobsScope: 'today'` in the profile feature (`useMyProfile.ts` / `users.ts`).
- [x] Task 6 — Tests (AC 10): extend `__tests__/home-screen.test.tsx` (mock profile payloads with embeds; assert filtering, strip, empty, navigation); `users.test.ts` for the `jobsScope` param.

## Dev Notes

- **Read first:** `src/screens/HomeScreen.tsx` (both branches — this story touches only the established branch; preserve the first-run copy and `isSetupComplete` logic byte-for-byte), `src/features/jobs/components/JobCard.tsx` (footer/anatomy conventions; pass `scope` default), `src/features/jobs/format.ts` (`serviceTypeLabel`, `statusToBadge`), `src/components/HomeHeader.tsx` (one-shot scope param pattern at HomeScreen.tsx:60-78).
- **No `openEdit` route param** — the assign-footer that motivated it is dropped (schema has no unassigned jobs); `JobDetail: { jobId: string }` stays as-is.
- **Sorting:** `scheduledStart` ascending — reuse/extend the jobs feature's existing comparison rather than writing new date math; undated-before-timed only within the same timestamp. All day comparisons stay IST (`formatIstDateLabel` conventions — never local device time).
- **No new status colours:** overdue accent = `colors.status.scheduled.fg` (amber, calm); urgent badge unchanged (borrowed `cancelled` palette). Never red for overdue.
- **Strip is a pointer, not a list** — it renders a count only, at any magnitude (EXPERIENCE.md Component Patterns).
- **Profile store semantics are already correct:** focus throttle (15s), forced refresh after mutations (Story 1.4) — do not add fetch logic in the section component; it is a pure renderer of `profile`.
- `Paginated<unknown>` for `customers` stays as-is (out of scope).
- Testing: `bun run test` (never bare `bun test` — Flow types break); `bunx tsc --noEmit` clean.
- [Source: DESIGN.md + EXPERIENCE.md (contracts); src/screens/HomeScreen.tsx; src/services/resources/users.ts:95-125; src/features/jobs/components/JobCard.tsx; src/features/jobDetail/JobDetailScreen.tsx (EditJobSheet hosting); src/navigation/types.ts:41; api-contracts.md §14].

## Dev Agent Record

### Agent Model Used

Claude Code (Sonnet 5) — BMAD dev-story run, 2026-09-05

### Debug Log References

- `bunx tsc --noEmit` — clean, no errors.
- `bun run test --watchman=false` — 524/524 pass across 62 suites (16 in `__tests__/home-screen.test.tsx`, including all 10 new/updated for this story).
- `bun run lint` — pre-existing repo issue, unrelated to this story: ESLint 8.57.1 reports no config file found at the project root or above. Not introduced by this change; left as-is.

### Completion Notes List

- Task 3 deviates from the literal "interactive `Card`" wording: `Card`'s `interactive` mode wraps its own `Pressable` internally and doesn't forward an `accessibilityRole` prop, so AC 9's `accessibilityRole="button"` requirement couldn't be met that way. `OverdueStrip` instead mirrors `HomeHeader`'s existing `StatCard` pattern — a plain `Pressable` (carrying `accessibilityRole`/`accessibilityLabel`) wrapping a non-interactive `Card` — same visual result, accessible.
- `selectTodayJobs` (new pure filter+sort helper in `src/features/home/selectTodayJobs.ts`, exported from the feature barrel) implements the status filter (`scheduled`/`in_progress` only) and the `scheduledStart` ASC / undated-before-timed-in-same-slot tie-break from AC 2 — no existing comparator existed to reuse, so this is new date math (Dev Notes said reuse one where possible; none was found in the jobs feature).
- `technicians` (the roster) is passed into `TodaysJobsSection` as an explicit prop beyond the ones the task list names — required for the AC 3/AC 5 roster-lookup fallback when a profile job row's embedded `technician.name` is `null` (data-anomaly rows per fenzit-be 3-9 review notes); resolved the same way `JobsScreen` already does (`Map` keyed by technician id).
- `useMyProfile.ts`'s shared fetch now always requests `jobsScope: 'today'` — verified no other consumer reads `profile.jobs` (grepped the repo; only `HomeScreen` did, and only as a comment prior to this story), so this doesn't regress the More/profile screens.
- First-run branch of `HomeScreen` is untouched byte-for-byte — its own `noJobsCard`/`jobsSection`/`sectionTitle` styles stay in `HomeScreen`'s stylesheet (still referenced there); only the established branch's card block was removed and replaced with `TodaysJobsSection`, which owns its own independent copies of the equivalent styles.
- `usersApi.getMe` now always sends a `params` object (empty when `jobsScope` is omitted) — updated the one pre-existing test in `users.test.ts` that pinned the old no-params call shape, and added two new tests for the `jobsScope` param.

### Review Findings

Code review (medium effort, 5 finder angles + verification pass), 2026-09-05. All `patch`-worthy findings applied in the same pass; `defer`s recorded in `deferred-work.md`.

- [x] [Review][Patch] **`setProfileFromServer` overwrote `jobs` wholesale from the PATCH response** — `PATCH /users/me` has no `jobsScope` param (GET-only), so its `jobs` page is always the unscoped default; saving a name from Profile Edit was silently swapping Home's today-scoped, `scheduledStart`-sorted list for an unrelated one until the next throttled refetch. Fixed in `useMyProfile.ts`: `setProfileFromServer` now keeps the store's existing `jobs` and takes every other field from the PATCH payload. Pinned by a new test in `useMyProfile.test.ts`.
- [x] [Review][Patch] **`selectTodayJobs`'s sort comparator could return `NaN`** — a malformed `scheduledStart` parses to `NaN` via `Date#getTime`, an invalid `Array#sort` comparator result (engine-dependent ordering). Guarded with `Number.isNaN` so a malformed timestamp falls through to the tie-break instead. Pinned by a new `home-screen.test.tsx` case.
- [x] [Review][Patch] **Empty-string embed name bypassed the fallback chain** — `job.technician.name ?? …` (and the equivalent for `customer.name`) only treats `null`/`undefined` as "missing"; an empty-string anomaly row would render a blank name/avatar instead of falling through. Changed both to `||` chains in `TodaysJobsSection.tsx`. Pinned by a new `home-screen.test.tsx` case.
- [x] [Review][Patch] **`getMe`'s doc comment overclaimed `'all'`'s wire behaviour** — said omitted/`'all'` both send the "byte-compatible default", but only omission skips the query param; an explicit `'all'` sends `?jobsScope=all` (harmless — the backend treats both identically per fenzit-be 3-9 AC 2 — but the comment was imprecise). Comment corrected in `users.ts`.
- [ ] [Review][Defer] Today's jobs section has no pagination/truncation notice — recorded in `deferred-work.md` (needs a UX decision, no AC calls for it).
- [ ] [Review][Defer] `Card` doesn't forward `accessibilityRole`, forcing a hand-rolled `Pressable`-wraps-`Card` workaround (now two copies: `OverdueStrip`, `HomeHeader`'s `StatCard`) — recorded in `deferred-work.md`.
- [ ] [Review][Defer] New files use relative imports instead of the CLAUDE.md `@/` aliases — matches every sibling file in this feature area; folded into the repo-wide alias migration already deferred from prior stories' reviews.

### File List

- `src/services/resources/users.ts` — `ProfileTechnicianSummary`, `ProfileCustomerSummary`, `ProfileJob` types; `MyProfile.jobs` now `Paginated<ProfileJob>`; `getMe` gains `jobsScope` param; doc-comment fix (review)
- `src/services/resources/users.test.ts` — updated existing `getMe` call-shape test; added `jobsScope` param tests
- `src/services/resources/index.ts` — export `ProfileTechnicianSummary`, `ProfileCustomerSummary`, `ProfileJob`
- `src/features/profile/useMyProfile.ts` — `fetchProfile` now calls `usersApi.getMe(undefined, 'today')`; `setProfileFromServer` preserves existing `jobs` (review fix)
- `src/features/home/selectTodayJobs.ts` — NEW: pure filter+sort helper for the Today section; NaN-safe comparator (review fix)
- `src/features/home/components/OverdueStrip.tsx` — NEW
- `src/features/home/components/TodaysJobsSection.tsx` — NEW; `||`-based name fallback chains (review fix)
- `src/features/home/index.ts` — export `TodaysJobsSection`, `selectTodayJobs`
- `src/screens/HomeScreen.tsx` — established branch now renders `TodaysJobsSection`; added `handlePressJob`; first-run branch unchanged
- `__tests__/home-screen.test.tsx` — `makeProfileJob` helper; 12 new tests (filtering/sorting, strip visibility, strip-alone, empty state with/without CTA, name resolution + null/empty-string anomaly fallback, malformed-date safety, navigation ×3)
- `__tests__/useMyProfile.test.ts` — new test pinning `jobs` preservation across `setProfileFromServer`

### Change Log

- 2026-09-05: Story implemented per tasks 1-6 (red-green-refactor); all ACs covered; `bunx tsc --noEmit` clean, `bun run test` 524/524 green. Status → review.
- 2026-09-05: Code review (medium effort) — 4 patch findings applied (PATCH-response `jobs` overwrite regression, NaN-unsafe sort, empty-string name fallback, doc-comment accuracy), 3 deferred to `deferred-work.md`. Tests 527/527, `tsc` clean.