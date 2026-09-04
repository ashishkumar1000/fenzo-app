---
baseline_commit: 7c43452f0c76d273768bd94900204a7d5a41ee00
---

# Story 2.1: Customer Detail with Job History

Status: done
Blocked-by: RESOLVED — fenzit-be Story 2.4 is done (2026-09-03, code review passed, live-DB verified). Real `jobHistory` data, `id` on rows, and `?cursor=` all exist in BE now (uncommitted on fenzit-be `main` at time of writing — commit/merge it before running the FE against it). The "optional id / guard" fallbacks below are no longer needed; flip them at build time per the story's own instructions.

## Story

As an owner,
I want a customer's full profile and their complete job history,
so that I can review their service record before creating a new job.

## API Contract (api-contracts.md §13 — gap closed 2026-09-03)

`GET /customers/:id[?cursor=]` → `CustomerDetail = { id, name, countryCode, phoneNumber, address, city, createdVia, createdAt, tenantId, jobHistory: Paginated<JobHistoryItem> }` with `JobHistoryItem { id, jobNumber, scheduledStart, status, serviceType }`. History: `scheduled_start DESC`, page size 20, keyset via `?cursor=` (pass `jobHistory.nextCursor` back verbatim). Cursors are endpoint-scoped — a `GET /jobs` cursor is rejected with 400 here. Errors: 404 cross-tenant/missing, 403 technician, 400 malformed/foreign cursor.

## UI Design (ui-design-spec.md §6, §4)

Back header title = customer name. FlatList (padding s4): ListHeader = profile Card (Avatar lg + name @20 + trailing Phone IconButton; meta rows: formatted phone, MapPin `customerLocation`; caption "Customer since <date>") then section header row "Job history" (heading@16). HistoryRow = Card md, interactive only when `row.id` exists: row 1 bodyStrong jobNumber + Badge right; row 2 meta rows Calendar date + service icon + serviceTypeLabel. Separator s3; footer spinner on load-more. Empty history: EmptyState(Briefcase) "No jobs yet" / "Jobs for this customer will appear here." 404 mirrors the job-detail not-found view. Copy from spec §15.

## Acceptance Criteria

1. **Given** a CustomerRow tap on CustomersScreen, **then** navigation pushes `CustomerDetail { customerId }` (RootNavigator, headerShown false, back header), which fetches on mount and renders a profile Card: name, phone (formatPhone + tap-to-call via `openTel`), address + city line (reuse `customerLocation` from features/customers/format).
2. **Given** jobHistory data, **then** rows render newest-first: jobNumber, `new Date(scheduledStart).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })`, status Badge via `statusToBadge`, serviceType label; **given** `hasMore`, **then** scroll-end loads the next page via `?cursor=` and appends without duplicate ids.
3. **Given** a history row tap (once BE 2.4 supplies `id`), **then** it pushes `JobDetail { jobId: row.id }`; while `id` is absent from the payload, rows render non-pressable (guard `row.id != null`).
4. **Given** zero history, **then** EmptyState "No jobs yet" + "Jobs for this customer will appear here." (ui-design-spec §6/§15 copy) in the history section — the profile card still renders.
5. **Given** pull-to-refresh, **then** profile + first history page refetch (cursor state resets); **given** 404, **then** the friendly not-found view with Back; loading = centered spinner.

## Tasks / Subtasks

- [x] **Task 1 — Service** (`services/resources/customers.ts`): add
  ```ts
  export interface JobHistoryItem { id?: string; jobNumber: string; scheduledStart: string; status: string; serviceType: string }
  export interface CustomerDetail { id: string; name: string; countryCode: string; phoneNumber: string; address: string | null; city: string | null; createdVia: 'manual' | 'job_creation'; createdAt: string; tenantId: string; jobHistory: Paginated<JobHistoryItem> }
  async function getById(id: string, cursor?: string): Promise<CustomerDetail> {
    const res = await apiClient.get<CustomerDetail>(`/customers/${id}`, cursor ? { params: { cursor } } : undefined);
    return res.data;
  }
  ```
  (`id?` optional until BE 2.4 — flip to required and drop the guard when it merges.) Add to `customerService` + barrel.
- [x] **Task 2 — Navigation** (`navigation/types.ts` + `RootNavigator.tsx`): `CustomerDetail: { customerId: string }`; register screen.
- [x] **Task 3 — Screen** (`features/customerDetail/CustomerDetailScreen.tsx`, new): FlatList with `ListHeaderComponent` = profile SectionCard (reuse Story 1.2's SectionCard/PersonRow) + "Job history" heading; items = `HistoryRow` (new small component in `features/customerDetail/components/`); `onEndReached` → fetch with `jobHistory.nextCursor`, append `data` deduped by `jobNumber` (stable even pre-id); `RefreshControl` resets and refetches; local state `{ detail, rows, nextCursor, hasMore, isLoading, isLoadingMore, error }`.
- [x] **Task 4 — Entry point** (`features/customers/components/CustomerRow.tsx` + CustomersScreen): add `onPress` prop → `navigation.navigate('CustomerDetail', { customerId: customer.id })`; keep the AddCustomerSheet flows untouched.
- [x] **Task 5 — Tests**: pagination append dedup; empty-history branch; non-pressable row when `id` missing; 404 branch.

## Dev Notes

- Owner-only endpoint; the screen lives only in the owner nav tree — no role branching.
- History `status`/`serviceType` are the same wire enums as jobs — reuse `statusToBadge` and the serviceType label map from `features/jobs/format.ts` (export a `serviceTypeLabel()` there if 1.1 didn't).
- Cross-check after BE 2.4 merges: update api-contracts.md §13 (remove the gap warning), flip `id` to required here, enable row press.
- Files: NEW `features/customerDetail/CustomerDetailScreen.tsx`, `features/customerDetail/components/HistoryRow.tsx`, `features/customerDetail/index.ts`; MODIFY `services/resources/customers.ts` + barrel, `navigation/types.ts`, `navigation/RootNavigator.tsx`, `features/customers/components/CustomerRow.tsx`, `features/customers/CustomersScreen.tsx`.
- [Source: api-contracts.md §13; fenzit-be customers.service.ts L63–72, L381–428; fenzit-be story 2-4-customer-detail-job-history.md; features/customers/format.ts].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- BE 2.4 is merged on `fenzit-be` (commit `5d1aed4`), so the story's fallbacks were flipped at build time as instructed: `JobHistoryItem.id` is **required**, history rows are always pressable (`onPress` → `JobDetail { jobId: row.id }`), and append dedupe keys on `id` (was "jobNumber pre-id") — id is the stable key and is what navigation needs.
- `getById(id, cursor?, signal?)` — added the abort-signal param beyond the story's snippet so the screen can cancel in-flight requests on unmount/refresh, matching `jobService.getById`'s precedent (Story 1.2's busy-guard + AbortController pattern).
- `customerLocation`/`customerPhone` were re-typed from `Customer` to `Pick<Customer, …>` on the fields they use — `CustomerDetail` has no `jobCount`/`lastJobDate`, and the formatters don't use them. Type-only change, behaviour untouched.
- HistoryRow renders its own badge labels and service icon (same local maps as JobCard/JobDetailScreen) rather than importing across features.
- api-contracts.md §13 was already updated when BE 2-4 landed (gap-closed marker, `id` required) — no doc change needed.
- Screen mirrors JobDetailScreen's state machine: one-request-at-a-time busy guard, abort on unmount, refresh keeps content, 404/403 → not-available EmptyState, other failures → InlineError + Retry.
- Load-more failure keeps rows on screen and logs (spec §3); pull-to-refresh is the recovery path.
- Tests: 9 new (8 screen + 1 entry-point navigation). Full suite 217/217 green, `tsc --noEmit` clean. Note: `bun run lint` cannot run — the repo has no ESLint config (pre-existing; not touched here).
- Sandbox note: jest needs `--watchman=false` in this environment (watchman's state dir is blocked); the script itself is unchanged.
- Task 3 said to reuse Story 1.2's SectionCard/PersonRow for the profile block, but §6 describes it as an untitled Card md (Avatar lg + name + PersonRow-style phone IconButton) — a titled SectionCard wouldn't fit. The profile card is a raw Card md carrying the same identity/meta-row layout; only the phone IconButton is PersonRow-style. (Deviation documented per review.)

### File List

- `src/services/resources/customers.ts` (MODIFIED — `JobHistoryItem`, `CustomerDetail`, `getById`)
- `src/services/resources/index.ts` (MODIFIED — export new types)
- `src/navigation/types.ts` (MODIFIED — `CustomerDetail` route)
- `src/navigation/RootNavigator.tsx` (MODIFIED — register screen)
- `src/features/customerDetail/CustomerDetailScreen.tsx` (NEW)
- `src/features/customerDetail/components/HistoryRow.tsx` (NEW)
- `src/features/customerDetail/index.ts` (NEW)
- `src/features/customers/CustomersScreen.tsx` (MODIFIED — row tap navigates)
- `src/features/customers/format.ts` (MODIFIED — formatter param types narrowed)
- `__tests__/customer-detail-screen.test.tsx` (NEW)
- `__tests__/customers-screen.test.tsx` (NEW)

## Change Log

- 2026-09-04 — Story 2-1 implemented: customer detail screen with profile card, paginated job history (cursor + dedupe), row-tap to JobDetail, empty/404/error states; entry point wired from the Customers list. Status → review.
- 2026-09-04 — Code review applied (8 patches): silent refetch on focus with a new test pinning it, §0 back-header spacing, HistoryRow contract cleanup, page-internal load-more dedupe, central TZ pin in jest.setup.js, §15 copy inventory + AC4 wording fixed, SectionCard deviation documented. Deferred items (4) recorded in `deferred-work.md`. Suite 218/218, `tsc --noEmit` clean. Status → done.

### Review Findings

- [x] [Review][Patch] Stale history after returning from JobDetail — decided 2026-09-04: silent refetch on focus (page 1, spinner-free, content stays) so the history is always current, matching JobDetail's "fresh on every open" philosophy [src/features/customerDetail/CustomerDetailScreen.tsx]
- [x] [Review][Patch] Back header spacing off the §0 pattern (`gap: s1`, `paddingHorizontal: s2` instead of §0's `gap: s3`, `paddingHorizontal: s4` — JobDetailScreen's header is the reference) [src/features/customerDetail/CustomerDetailScreen.tsx]
- [x] [Review][Patch] HistoryRow still carries the pre-id fallback: optional `onPress` + a doc comment saying "pressable only when the BE supplied the row's id" — `JobHistoryItem.id` is required and the screen always passes `onPress`; make `onPress` required and drop the stale comment [src/features/customerDetail/components/HistoryRow.tsx]
- [x] [Review][Patch] Load-more dedupe filters the incoming page against existing rows only, not against duplicates within the page itself [src/features/customerDetail/CustomerDetailScreen.tsx]
- [x] [Review][Patch] Date assertions depend on the device timezone — `toLocaleDateString('en-IN', …)` on a UTC timestamp reads 11 Aug in behind-UTC timezones; pin TZ centrally in jest.setup.js (per-file pins fail tsc — `process` is untyped in the RN tsconfig) [jest.setup.js, __tests__/customers-screen.test.tsx]
- [x] [Review][Patch] ui-design-spec §15's copy inventory is missing the two new customer strings ("This customer isn't available" / "It may have been removed or is from another company.") [planning-artifacts/ui-design-spec.md §15]
- [x] [Review][Patch] Story AC4 says "No jobs yet for this customer" but §6/§15 fix the copy as "No jobs yet" + "Jobs for this customer will appear here." (what was implemented); correct the AC text so the sources agree [story file]
- [x] [Review][Patch] Task 3's "reuse SectionCard/PersonRow" was not followed (raw Card md + PersonRow-style IconButton instead — §6 describes an untitled card, so the deviation is right, but it is not documented) — add a completion note [story file]
- [x] [Review][Defer] `dateLine` is now copy-pasted in three screens (JobDetailScreen started it; HistoryRow + CustomerDetailScreen followed) — unify into one shared formatter [src/features/customerDetail/CustomerDetailScreen.tsx] — deferred, pre-existing
- [x] [Review][Defer] Test coverage beyond the story's Task 5 scope: call action (openTel), back button, 403-as-not-found, load-more failure branch [__tests__/customer-detail-screen.test.tsx] — deferred, pre-existing
- [x] [Review][Defer] History rows carry no explicit accessibility role/label (jobNumber + status) [src/features/customerDetail/components/HistoryRow.tsx] — deferred, pre-existing
- [x] [Review][Defer] Relative imports repo-wide despite the CLAUDE.md absolute-alias mandate — this change follows existing precedent; the migration is a repo-wide cleanup [src/features/customerDetail/] — deferred, pre-existing
