# Story 2.2: One Data Path for the Customer List

Status: ready-for-dev

## Story

As a developer,
I want CustomersScreen to read from the shared `useCustomers` store,
so that there is exactly one fetch path to `GET /customers` and screens can never disagree.

## UI Design

Zero visual change — plumbing only. Screen must look pixel-identical before/after.

## Current State (verified in source 2026-09-01)

`CustomersScreen.tsx` holds a PRIVATE fetch: `useState<Customer[]>` + `customerService.list()` in a `fetchCustomers` callback, first page only (its own TODO admits hasMore/nextCursor are ignored), focus-refetch and refresh flags all local (L33–50). Meanwhile `useCustomers` (features/customers/useCustomers.ts) is the API-backed shared store using `customerService.listAll()` (ALL pages) with in-flight dedup and `upsertCustomer` — its header comment explicitly asks for this migration. Search is client-side (screen comment claims "endpoint takes no query param" — WRONG: `q` exists server-side, api-contracts.md §12 — but client-side filter over the full listAll dataset is the chosen Phase-1 approach; keep it).

## Acceptance Criteria

1. CustomersScreen renders exclusively from `useCustomers()`; its private `customers/isLoading/loadError/isRefreshing/hasLoadedOnce` state and `fetchCustomers` are deleted; the first-page-only TODO disappears with them (listAll paginates fully).
2. **Given** the tab regains focus, **then** the store refreshes with the shared 15s throttle (`FOCUS_REFRESH_TTL_MS` from Story 1.4); **given** pull-to-refresh, **then** `refresh()` (force) runs unconditionally and the RefreshControl resolves on settle.
3. **Given** AddCustomerSheet saves, **then** the flow is unchanged: parent awaits `customerService.create`, then `upsertCustomer(created)` puts the row on top instantly (verify the screen currently maps `CreatedCustomer` → local `Customer` type; keep the mapping in one place).
4. **Given** the search input, **then** filtering is client-side over the store list: case-insensitive substring on `name` and on the digits of `phoneNumber` (mirror BE `q` semantics so a later server switch is invisible) — extract to `filterCustomers(customers, query)` in `features/customers/format.ts`.
5. **Given** Customers tab and NewJob's picker mounting in the same session, **then** exactly one network fetch occurs (store dedup) — verify manually via Metro network logs and note in Dev Agent Record.
6. Logout still calls the store `clear()` (MoreScreen already wires stores — add this one if missing).

## Tasks / Subtasks

- [ ] **Task 1 — Store touch-up** (`features/customers/useCustomers.ts`): add `lastLoadedAt` + `loadCustomers(opts { force? })` throttle exactly like Story 1.4's pattern; `refresh` = force. Keep `upsertCustomer` and the in-flight dedup as-is.
- [ ] **Task 2 — Screen migration** (`features/customers/CustomersScreen.tsx`): swap to `const { customers, isLoading, error, hasLoaded, refresh } = useCustomers()`; keep ONLY `query` + `sheetVisible` as local state; `useFocusEffect` → `loadCustomers()`; delete dead imports (`customerService` direct use stays only inside the sheet-save handler if the handler lives here — check; ideally the create call moves next to `upsertCustomer` in one `handleAdd`).
- [ ] **Task 3 — Search extraction** (`features/customers/format.ts`): `export function filterCustomers(list: Customer[], q: string): Customer[]` — trim, lowercase; empty q returns list; match `name.toLowerCase().includes(q)` OR `phoneNumber.includes(digitsOnly(q))`.
- [ ] **Task 4 — Regression pass** (manual, record in Dev Agent Record): add customer → top of list instantly; NewJob picker unchanged; pull-to-refresh; focus throttle; logout clears.
- [ ] **Task 5 — Tests** (`__tests__/customers-filter.test.ts`): name match case-insensitive; phone digit substring; empty query passthrough; no match → [].

## Dev Notes

- Zero visual changes; this is plumbing. Diff should be small and mostly deletions.
- `Customer` (feature type) vs `ApiCustomer` (service type): the store already bridges them — do not introduce a third shape.
- The wrong "no query param" comment on the screen gets corrected to reference the deliberate client-side choice + api-contracts.md §12.
- Files: MODIFY `features/customers/useCustomers.ts`, `features/customers/CustomersScreen.tsx`, `features/customers/format.ts`, possibly `features/more/MoreScreen.tsx` (clear), tests.
- [Source: features/customers/useCustomers.ts header comment L15–18; features/customers/CustomersScreen.tsx L33–50; api-contracts.md §12; epics.md Review Note 5].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
