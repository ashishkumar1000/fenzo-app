# Story 2.1: Customer Detail with Job History

Status: ready-for-dev
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
4. **Given** zero history, **then** EmptyState "No jobs yet for this customer" in the history section — the profile card still renders.
5. **Given** pull-to-refresh, **then** profile + first history page refetch (cursor state resets); **given** 404, **then** the friendly not-found view with Back; loading = centered spinner.

## Tasks / Subtasks

- [ ] **Task 1 — Service** (`services/resources/customers.ts`): add
  ```ts
  export interface JobHistoryItem { id?: string; jobNumber: string; scheduledStart: string; status: string; serviceType: string }
  export interface CustomerDetail { id: string; name: string; countryCode: string; phoneNumber: string; address: string | null; city: string | null; createdVia: 'manual' | 'job_creation'; createdAt: string; tenantId: string; jobHistory: Paginated<JobHistoryItem> }
  async function getById(id: string, cursor?: string): Promise<CustomerDetail> {
    const res = await apiClient.get<CustomerDetail>(`/customers/${id}`, cursor ? { params: { cursor } } : undefined);
    return res.data;
  }
  ```
  (`id?` optional until BE 2.4 — flip to required and drop the guard when it merges.) Add to `customerService` + barrel.
- [ ] **Task 2 — Navigation** (`navigation/types.ts` + `RootNavigator.tsx`): `CustomerDetail: { customerId: string }`; register screen.
- [ ] **Task 3 — Screen** (`features/customerDetail/CustomerDetailScreen.tsx`, new): FlatList with `ListHeaderComponent` = profile SectionCard (reuse Story 1.2's SectionCard/PersonRow) + "Job history" heading; items = `HistoryRow` (new small component in `features/customerDetail/components/`); `onEndReached` → fetch with `jobHistory.nextCursor`, append `data` deduped by `jobNumber` (stable even pre-id); `RefreshControl` resets and refetches; local state `{ detail, rows, nextCursor, hasMore, isLoading, isLoadingMore, error }`.
- [ ] **Task 4 — Entry point** (`features/customers/components/CustomerRow.tsx` + CustomersScreen): add `onPress` prop → `navigation.navigate('CustomerDetail', { customerId: customer.id })`; keep the AddCustomerSheet flows untouched.
- [ ] **Task 5 — Tests**: pagination append dedup; empty-history branch; non-pressable row when `id` missing; 404 branch.

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

### File List

## Change Log
