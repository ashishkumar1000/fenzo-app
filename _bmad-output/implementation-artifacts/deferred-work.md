# Deferred Work

## Deferred from: code review of 1-1-wire-jobs-list-to-get-jobs (2026-09-03)

- ~~**App.test.tsx fails to boot**~~ — **Fixed 2026-09-03.** Three stacked fixes, each unblocking the next: (1) worklets mock + css/native/proxy `setCSSEventHandler` noop in `jest.setup.js` (reanimated 4.6's own mock imports the real source, whose native initializer crashes in jest); (2) `__mocks__/react-native-bootsplash.ts` (TurboModule can't exist in jest); (3) `__mocks__/react-native-mmkv.ts` (Map-backed) + `@react-native-community/datetimepicker` added to the `transformIgnorePatterns` ESM allowlist. Baseline is now green: 5/5 suites, 43/43 tests.
- ~~**JobsScreen has no component test**~~ — **Fixed 2026-09-03** (`__tests__/JobsScreen.test.tsx`, 7 tests). The boot-mock work above made the scaffolding trivial: the real screen mounts with the real `useJobs` store (`jobService` mocked at the module boundary), profile/customers stubbed to static data, and `useFocusEffect` reduced to "run once mounted". Covers: loading spinner, name resolution, failed-no-data (banner + Retry refetch), failed-refresh-with-data (dismissible banner, rows kept), per-filter empty-state copy, `onEndReached` pagination, and "New job" navigation.
- **401 forced-logout clears no stores** — `setOnUnauthorized` is exported from `src/services/api/apiClient.ts` but never registered anywhere in the app, so an expired session forces nothing. Global session-expiry handling is Story 5.3's scope; when wiring it, clear the jobs store (tenant-scoped data must not survive auth expiry) alongside profile/customers/technicians.
- **Technician-side screens render placeholder-heavy cards** — TodayScreen/HistoryScreen pass no `customerName`/`technicianName`, so cards fall back to service-type labels and a literal 'Technician' avatar. Story 3.1 owns the technician card variant; the arrays are empty today.

## Deferred from: code review of 1-2-owner-job-detail-screen (2026-09-03)

- **Activity timeline event class is colour-only** — the step/completed/cancelled/neutral distinction on timeline dots is conveyed only by dot colour; no text or accessibility label carries it, which fails colour-blind and screen-reader users. Fix with an `accessibilityLabel` on each timeline row (e.g. include the event class wording) when accessibility polish lands.
- **Detail dates render in the device timezone** — `dateLine`/`timestampLabel` format UTC `scheduledStart`/`createdAt` via `toLocaleDateString('en-IN', …)` with no timezone pin, so the displayed day can shift on non-IST devices (early-morning IST slots land on the previous day in UTC-land). Decide the canonical display timezone (probably IST) before launch and pin it centrally, not per-call.
- **Stale technician TODOs now point at an existing screen** — `TodayScreen.tsx:31-33` and `HistoryScreen.tsx:22-24` still say "navigate to a job detail screen once it exists"; that screen now exists (`JobDetail` route). Harmless today (lists are stub-empty), and Story 3.2 owns the technician-side adoption — but the comment should be cleared when that lands so it doesn't mislead.

## Deferred from: code review of 1-1-wire-jobs-list-to-get-jobs, params-serializer follow-up (2026-09-03)

- ~~**Backend query-parser contract has no pinned test**~~ — **Fixed 2026-09-03** (`fenzit-be/src/jobs/dto/list-jobs-query.dto.spec.ts`, 10 tests). Fastify's `inject()` pins the parser dialect (repeat style → string/array, bracket style survives as a literal `status[]` key), plus end-to-end DTO tests through a pipe config mirroring `main.ts` — including the trap case: `?status[]=bogus` validates as an empty query (200), while `?status=bogus` is a 422. fenzit-be suite: 18 suites, 262 tests green.

## Deferred from: code review of 1-3-edit-reassign-cancel-job (2026-09-04)
- ~~Zero-length schedule window (end == start) parity with server unverified~~ — **Resolved 2026-09-04.** Backend rule confirmed in fenzit-be source: createJob (`jobs.service.ts` ~L228) and the update RPC (`20260621000004_rpc_update_job_with_log.sql`, PT422 on the *effective* window) both reject with strict `<`, so a zero-length window is allowed server-side — exactly matching `scheduleWindowError`. Parity pinned by a new model test (both directions).
- ~~ApiError.message typed string but can arrive as an array~~ — **Resolved 2026-09-04 (pulled forward from Story 5.4).** Normalized at the source: `toApiError` now flattens the ValidationPipe's array form (join with '. ') before it reaches any caller, so `ApiError.message` stays a plain `string` and all consumers stay type-safe. Pinned by `__tests__/api-error.test.ts` (3 tests). The model-level `flattenApiMessage` stays as a defensive belt for errors that bypass `toApiError`.
- ~~No e2e/testID/accessibility hooks on EditJobSheet controls~~ — **Resolved 2026-09-04.** Added `testID` hooks: `edit-job-save`, `edit-job-priority-{normal|urgent}`, `edit-job-form-error`, `technician-row-<id>` (rows variant) and `technician-tile-<id>` (tiles variant); `Button` now forwards a `testID` to its Pressable. Sheet test pins the hooks so they can't silently regress.

## Deferred from: code review of 1-4-home-stats-refresh (2026-09-04)

- **`useJobs.ts` keeps its own `15_000` throttle literal** — `FOCUS_REFRESH_TTL_MS` now exists in `src/constants` for exactly this, but `useJobs.ts` (story 1-2's file) still hard-codes the literal, so the "single place" claim in the constant's doc comment isn't true yet. Migrate it to the constant when Stories 2.2/3.1 adopt the TTL.
- ~~**`fetchProfile` catch doesn't handle non-ApiError rejections**~~ — **Fixed 2026-09-04.** The catch now falls back to 'Something went wrong' when the rejection carries no usable message (`||`, not `??` — an empty/undefined message must not render as no-banner), pinned by a test covering both a TypeError passthrough and an undefined rejection. Sibling stores `useJobs.ts`/`useCustomers.ts` carry the same pattern — fix them the same way if/when touched. — if `getMe` rejects with a TypeError/abort/syntax error, `(error as ApiError).message` is undefined and falsy, so a failed refresh renders no error banner while `profile` is retained — looks like success. Fix: fall back to a generic message in the catch. Pre-existing behaviour, surfaced incidentally by this review.
- **Repo has no ESLint config** — `bun run lint` fails with "couldn't find a configuration file" for every story, so lint is never a real gate. Set up an ESLint (or Biome) config once, repo-wide.

- **`totalJobs` sum duplicated between HomeScreen and HomeHeader** — `src/screens/HomeScreen.tsx` (~L114) and `src/components/HomeHeader.tsx` (~L33) each independently sum the same five `jobCounts` buckets; a bucket added later in only one copy would drift the header total from the tiles. Pass the precomputed total into `HomeHeader` instead.

## Deferred from: code review of 1-5-jobs-timeline-scopes (2026-09-04)

- **`upsertJob` row can be overwritten by an in-flight page-1 response** —
  `src/features/jobs/useJobs.ts` (~L230-236): a create/cancel triggers `upsertJob` (prepend for
  today-scope rows) while a page-1 refetch is still in flight; when the stale response lands it
  replaces the list and drops the upserted row. Pre-existing pattern, not introduced by this
  story. Mitigation today: the throttled focus refetch picks the row back up on next focus.
  Fix direction: version/generation-tag in-flight fetches so stale responses can't clobber.
- **`upsertJob` IST-midnight boundary edge** — `src/features/jobs/useJobs.ts` (~L231): a job
  confirmed right at the IST day boundary is guard-rejected (correctly, per the day guard) and
  vanishes from Today until the next focus refetch triggers a reload. Same pre-existing
  pattern family as the race above; fix both together if ever worth it.
- **`list()` sends `date` alongside a non-today scope unguarded** —
  `src/services/resources/jobs.ts` (~L275-284): the client-side type permits `date` with
  `scope=upcoming|overdue|history`, which the server 422s. The store never sends `date`, so
  it's unreachable today; note it as a contract shape to tighten (client-side type narrowing)
  if a caller ever combines the two.
