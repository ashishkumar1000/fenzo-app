---
baseline_commit: 641d2fc27421e957ecdc4628aba61893ce7c3408
---

# Story 2.2: One Data Path for the Customer List

Status: done

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

- [x] **Task 1 — Store touch-up** (`features/customers/useCustomers.ts`): add `lastLoadedAt` + `loadCustomers(opts { force? })` throttle exactly like Story 1.4's pattern; `refresh` = force. Keep `upsertCustomer` and the in-flight dedup as-is.
- [x] **Task 2 — Screen migration** (`features/customers/CustomersScreen.tsx`): swap to `const { customers, isLoading, error, hasLoaded, refresh } = useCustomers()`; keep ONLY `query` + `sheetVisible` as local state; `useFocusEffect` → `loadCustomers()`; delete dead imports (`customerService` direct use stays only inside the sheet-save handler if the handler lives here — check; ideally the create call moves next to `upsertCustomer` in one `handleAdd`).
- [x] **Task 3 — Search extraction** (`features/customers/format.ts`): `export function filterCustomers(list: Customer[], q: string): Customer[]` — trim, lowercase; empty q returns list; match `name.toLowerCase().includes(q)` OR `phoneNumber.includes(digitsOnly(q))`.
- [x] **Task 4 — Regression pass** (manual, record in Dev Agent Record): add customer → top of list instantly; NewJob picker unchanged; pull-to-refresh; focus throttle; logout clears.
- [x] **Task 5 — Tests** (`__tests__/customers-filter.test.ts`): name match case-insensitive; phone digit substring; empty query passthrough; no match → [].

## Dev Notes

- Zero visual changes; this is plumbing. Diff should be small and mostly deletions.
- `Customer` (feature type) vs `ApiCustomer` (service type): the store already bridges them — do not introduce a third shape.
- The wrong "no query param" comment on the screen gets corrected to reference the deliberate client-side choice + api-contracts.md §12.
- Files: MODIFY `features/customers/useCustomers.ts`, `features/customers/CustomersScreen.tsx`, `features/customers/format.ts`, possibly `features/more/MoreScreen.tsx` (clear), tests.
- [Source: features/customers/useCustomers.ts header comment L15–18; features/customers/CustomersScreen.tsx L33–50; api-contracts.md §12; epics.md Review Note 5].

## Dev Agent Record

### Agent Model Used

Claude Code (GLM) — 2026-09-04

### Debug Log References

- Red-green: `__tests__/customers-filter.test.ts` + `__tests__/useCustomers.test.ts` written first, confirmed failing (14/15), then implemented to green.
- Early store-test failure: `TypeError: Cannot read properties of undefined (reading 'length')` — later `listAll` calls in a test fell through to the bare jest mock (returns `undefined`), which corrupted `customers` in the store state. Fixed with a default `mockResolvedValue` in `beforeEach` (test-hygiene, not a product bug).
- `bun run test` needs `--no-watchman` in this sandbox (watchman cannot write its state dir); Jest CLI supports `--no-watchman` directly.
- `bun run lint` is a no-op — the repo has no ESLint config (pre-existing; `eslint .` errors with "couldn't find a configuration file").

### Completion Notes List

- **Task 1** — `useCustomers.ts` now mirrors the Story 1.4 (`useMyProfile`) pattern exactly: `lastLoadedAt` (success-only stamp), `loadCustomers({ force? })` with the 15s throttle + force-issues-own-request + `requestSeq` supersede guard, negative-elapsed clock guard, generic error fallback. `refresh` in the hook is now force (this also upgrades NewJobScreen's post-save `refreshCustomers()` to a forced refresh — desirable: a post-mutation refresh must land immediately).
- **Task 2** — Screen renders exclusively from `useCustomers()`; private fetch state, `fetchCustomers`, `hasLoadedOnce`, the first-page-only TODO, and the direct `customerService.list()` call are gone. Save flow now: `create` → `upsertCustomer(created)` (row on top instantly) → `await refresh()` (belt-and-braces server truth, same shape as NewJobScreen's save handler).
- **Deviation from Task 2's "keep ONLY query + sheetVisible as local state"**: two additional pieces of local state were kept — `isRefreshing` (RefreshControl needs a boolean it can resolve on settle; the store's `isLoading` deliberately stays false over existing rows) and `errorDismissed` (the store's `error` clears only on the next success, so the banner dismissal must be local). Both mirror the JobsScreen pattern shipped in Story 1.5 verbatim, with the same comments.
- **AC4 note** — the old client filter also matched `customerLocation` (city/address); `filterCustomers` narrows to name + phone digits per AC4's "mirror BE `q` semantics" (BE matches `name.ilike OR phone_number.ilike` only). Searching by city/address no longer matches — deliberate per the story; the header comment documents the client-side choice with the api-contracts.md §12 reference.
- **Task 4 (manual regression pass) — DONE on-device** (iPhone 17 Pro simulator, 2026-09-04, screenshots `~/Downloads/fenzo-task4-*.png`):
  - Add customer → "Test Row" (+91 9998887776) appeared at the TOP of the list instantly (AC3 ✅).
  - Search: phone-digit query "9998" filtered the 4-row list down to only "Test Row" (AC4 phone path ✅ on-device; the name path is covered by `customers-filter.test.ts` unit tests).
  - Pull-to-refresh: gesture exercised; list stayed correct, no error banner. The spinner settles faster than screenshot latency can capture — the store-side forced refresh it calls is unit-tested.
  - Tab switch (Customers → Jobs → Customers): list re-rendered instantly with state preserved (query intact) — consistent with the 15s throttle skipping a re-fetch within the window.
  - Logout (Account → Log out → confirm): app returned cleanly to the account-setup flow; `clearCustomers()` runs in the confirmed handler before `reset()` (AC6 ✅).
  - **AC5 caveat**: NewJob picker + Customers tab single-fetch could not be verified via Metro network logs (not readable headlessly from this session). The store's in-flight dedup ("one request for two subscribers") is unit-tested in `useCustomers.test.ts`, which is the automated proxy for this AC.
- **AC6** — MoreScreen logout now calls `clear()` on the customers store alongside technicians/jobs/profile.

### File List

- `src/features/customers/useCustomers.ts` (modified — throttle + lastLoadedAt + force + seq guard)
- `src/features/customers/CustomersScreen.tsx` (modified — store migration, dead code removed)
- `src/features/customers/format.ts` (modified — `filterCustomers` added)
- `src/features/customers/index.ts` (modified — export `filterCustomers`)
- `src/features/more/MoreScreen.tsx` (modified — clear customers store on logout)
- `__tests__/useCustomers.test.ts` (new)
- `__tests__/customers-filter.test.ts` (new)
- `__tests__/customers-screen.test.tsx` (modified — service mock moved from `list` envelope to `listAll` rows)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status tracking)

## Change Log

- 2026-09-04 — Story 2.2 implemented: single data path for the customer list. `useCustomers` gained the Story-1.4-style throttled focus refresh; `CustomersScreen` migrated off its private fetch onto the shared store; client search extracted to `filterCustomers` (BE `q`-mirroring semantics); logout clears the customers store. 233/233 tests, tsc clean. Task 4 manual regression pass completed on-device (iPhone 17 Pro simulator) — all checks passed; AC5 single-fetch verified via the store-dedup unit test (Metro logs not readable headlessly). Status → review.
- 2026-09-04 — Code review (in-session, post-Task-4): no correctness findings — store logic verified structurally identical to `useMyProfile`; NewJobScreen's forced post-save refresh confirmed compatible; error-banner dismissal verified sound (error passes through `null` between requests). Two fixes applied: corrected a wrong header comment in `customers-filter.test.ts` (the "+91 90000" example contradicted the pinned test), restored missing trailing newlines in `useCustomers.ts` / `CustomersScreen.tsx`. Suite re-run: 233/233, tsc clean.
