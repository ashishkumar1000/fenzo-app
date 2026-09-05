---
baseline_commit: be2d75d34ceb5345c91d66ecd30e07f63d3b7d94
---

# Story 5.2: Profile Edit

Status: done

## Story

As any signed-in user,
I want to correct my display name,
so that greetings, rosters, and activity logs show who I actually am.

## API Contract (api-contracts.md §14; fenzit-be update-profile.dto.ts)

`PATCH /users/me` body `{ name: string }` — server trims, then validates `MinLength(1) MaxLength(100)` → else 422. Both roles allowed. 200 → the SAME full role-branched profile payload as `GET /users/me` (treat exactly like a GET response and store it wholesale).

## UI Design (ui-design-spec.md §14)

Edit affordance = IconButton(Pencil 18, textMuted), 44px target, accessibilityLabel "Edit name", at the trailing edge of the owner account row / technician identity card. EditNameSheet: standard sheet chrome; title "Edit your name"; single Input prefilled, autoFocus, maxLength 100; footer Button primary lg fullWidth "Save" (disabled when unchanged/empty, loading); inline bodySm danger error line.

## Acceptance Criteria

1. **Given** the owner's More tab account card, **then** an Edit affordance (Pencil IconButton on the account row) opens `EditNameSheet`; **given** the technician Profile tab, **then** the same affordance on its identity card opens the same sheet.
2. **Given** the sheet, **then** one Input prefilled with `profile.name ?? ''` (autoFocus, maxLength 100); Save disabled when `trimmed === (profile.name ?? '')` or trimmed-empty; Cancel/backdrop closes without saving.
3. **Given** Save, **then** `usersApi.updateMe({ name: trimmed })` runs with the Button loading state; success → response payload replaces the profile store state (`setProfileFromServer(payload)`), sheet closes, and the name updates everywhere instantly (Home greeting, More account card, technician Profile) with no refetch.
4. **Given** a 422, **then** `ApiError.message` renders inline in the sheet (join arrays locally until 5.4); network errors likewise; the sheet stays open.

## Tasks / Subtasks

- [x] **Task 1 — Service** (`services/resources/users.ts`): `async function updateMe(body: { name: string }): Promise<MyProfile> { const res = await apiClient.patch<MyProfile>('/users/me', body); return res.data; }`; add to `usersApi` + barrel.
- [x] **Task 2 — Store setter** (`features/profile/useMyProfile.ts`): export `setProfileFromServer(profile: MyProfile)` — sets profile, clears error, updates `lastLoadedAt` (a PATCH response is as fresh as a GET). Reuse the internal setState.
- [x] **Task 3 — Sheet** (`features/profile/components/EditNameSheet.tsx`, new): AddCustomerSheet chrome; props `{ visible, currentName: string | null, onClose }`; submit per AC 3/4 (calls updateMe + setProfileFromServer internally — self-contained).
- [x] **Task 4 — Entry points**: MoreScreen account row gains the Pencil IconButton (44px target, `accessibilityLabel="Edit name"`); technicianApp/ProfileScreen identity card gains the same (locate its name render — add the affordance in the same visual language).
- [x] **Task 5 — Tests**: Save disabled on unchanged/empty; success path calls setProfileFromServer with the response; 422 keeps sheet open with message.

### Review Findings (2026-09-05)

- [x] [Review][Decision] Input label "Your name" + `required` marker not in the ui-design-spec §15 copy inventory — §15 is the single source for copy; either add the label there or relabel the Input. (low) — RESOLVED: kept the label, added "Your name" to the §15 Titles inventory.
- [x] [Review][Patch] PATCH result can be clobbered by an in-flight GET — `setProfileFromServer` never bumps `requestSeq`, so a GET that started before the PATCH passes the `seq !== requestSeq` guard on settle and overwrites the fresh name on every subscriber (also leaves `isLoading` unset); needs a seq bump + a PATCH-vs-in-flight-GET test [src/features/profile/useMyProfile.ts:123] (high) — FIXED (seq bump + `isLoading: false` + race test)
- [x] [Review][Patch] Draft-wipe mid-edit — resync `useEffect` deps `[visible, currentName]` fire while the sheet is open, so any profile-store update while it's open resets the Input and discards the user's typed draft; sync only on the open transition + test reopen-resync [src/features/profile/components/EditNameSheet.tsx:64] (medium) — FIXED (openedRef guard; reopen-resync + draft-survives tests)
- [x] [Review][Patch] AC 3: DS `Button.loading` prop unused — spinner is simulated with a "Saving…" label swap instead of the Button's dedicated `loading` state [src/features/profile/components/EditNameSheet.tsx:149] (medium) — FIXED (`loading={submitting}`, label stays "Save", loading-state test)
- [x] [Review][Patch] `usersApi.updateMe` PATCH contract unverified — no users resource test; add one (mock `apiClient`, assert method/path/body + `res.data` unwrap, per `jobs.test.ts` pattern) [src/services/resources/users.ts:134] (medium) — FIXED (`src/services/resources/users.test.ts`)
- [x] [Review][Patch] Pencil→sheet wiring untested on both entry screens — a broken `onPress` or dropped sheet mount ships green; add a MoreScreen wiring test (render, press "Edit name", assert sheet with live `currentName`) [src/features/more/MoreScreen.tsx:138] (medium) — FIXED (`__tests__/more-screen.test.tsx`)
- [x] [Review][Patch] Double-tap before the re-render commits fires a duplicate PATCH — guard with an in-flight ref [src/features/profile/components/EditNameSheet.tsx:94] (low) — FIXED (inFlightRef)
- [x] [Review][Patch] Missing trailing newlines in `EditNameSheet.tsx`, `EditNameSheet.test.tsx`, `__tests__/useMyProfile.test.ts` (low) — FIXED (all files now end with a newline)

## Dev Notes

- Smallest story in the plan — keep it that way. No avatar, no phone edit (phone is login identity; BE has no endpoint).
- Do NOT call `loadMyProfile()` after the PATCH — the response IS the fresh profile (one request, not two).
- Files: NEW `features/profile/components/EditNameSheet.tsx`; MODIFY `services/resources/users.ts` + barrel, `features/profile/useMyProfile.ts`, `features/profile/index.ts`, `features/more/MoreScreen.tsx`, `features/technicianApp/ProfileScreen.tsx`; tests.
- [Source: api-contracts.md §14; fenzit-be src/users/dto/update-profile.dto.ts (trim + 1..100); fenzit-be users.controller PATCH returns full profile].

## Dev Agent Record

### Agent Model Used

Claude (GLM) — Claude Code, 2026-09-05

### Debug Log References

- `bun run test` — 52 suites, 476 tests, all green (18 of them new/extended for this story).
- `bunx tsc --noEmit` — clean.

### Completion Notes List

- **apiClient.patch**: no change needed — `apiClient` is a plain axios instance, so `patch` (with `patch<T>` generics → `res.data`) is already available, matching the story's snippet verbatim.
- **Barrel**: `services/resources/index.ts` already exported `usersApi` + `MyProfile`; no barrel change required beyond the profile feature barrel.
- **422 array joining**: NOT needed locally — `flattenErrorMessage` in `apiError.ts` already joins NestJS ValidationPipe arrays into one `ApiError.message` string (centralized 2026-09-04). The sheet just renders `err.message`, which also covers network/timeout/cancelled shapes from `toApiError`.
- **Store setter**: `setProfileFromServer` stamps `lastLoadedAt` exactly like a successful GET, so the focus-refresh throttle treats a PATCH as fresh (pinned by a boundary test: throttled at `PATCH+TTL−1`, refreshed at `PATCH+TTL`).
- **Sheet prefill**: the draft re-syncs from `currentName` every time `visible` flips true (and clears a stale error), so a reopened sheet never carries an old draft — the sheet stays mounted like the other sheets.
- **Entry points**: MoreScreen account row trailing edge gets the Pencil IconButton (md size = 44px target, `accessibilityLabel="Edit name"`); technician Profile header wraps the name + same IconButton in a row (`nameRow`), keeping the centered identity header's visual language. Both render the one shared `EditNameSheet`.
- **Save label** = "Save" per ui-design-spec §15 copy inventory; loading state uses the DS `Button.loading` prop (spinner + press-block), label stays "Save" (review patch).

### File List

- `src/services/resources/users.ts` — MODIFIED (added `updateMe` to `usersApi`)
- `src/features/profile/useMyProfile.ts` — MODIFIED (added `setProfileFromServer`)
- `src/features/profile/index.ts` — MODIFIED (exports `setProfileFromServer`, `EditNameSheet`)
- `src/features/profile/components/EditNameSheet.tsx` — NEW
- `src/features/profile/components/EditNameSheet.test.tsx` — NEW
- `src/features/more/MoreScreen.tsx` — MODIFIED (pencil affordance + sheet)
- `src/features/technicianApp/ProfileScreen.tsx` — MODIFIED (pencil affordance + sheet)
- `__tests__/useMyProfile.test.ts` — MODIFIED (setProfileFromServer test)

## Change Log

- 2026-09-05 — Story 5.2 implemented: `usersApi.updateMe` (PATCH /users/me), `setProfileFromServer` store setter, shared `EditNameSheet`, pencil entry points on More account card + technician Profile header; tests added (sheet contract + store semantics); full suite green. Status → review.
- 2026-09-05 — BMAD code review (4 layers): 1 decision + 7 patches applied — `requestSeq` bump in `setProfileFromServer` (in-flight GET could clobber the PATCH), draft-wipe guard (`openedRef`), DS `Button.loading` used, `users.test.ts` wire-contract tests, MoreScreen pencil wiring test, double-tap `inFlightRef`, trailing newlines, §15 copy inventory gains "Your name". Full suite green (54 suites / 482 tests), tsc clean. Status → done.
