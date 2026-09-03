# Story 5.2: Profile Edit

Status: ready-for-dev

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

- [ ] **Task 1 — Service** (`services/resources/users.ts`): `async function updateMe(body: { name: string }): Promise<MyProfile> { const res = await apiClient.patch<MyProfile>('/users/me', body); return res.data; }`; add to `usersApi` + barrel.
- [ ] **Task 2 — Store setter** (`features/profile/useMyProfile.ts`): export `setProfileFromServer(profile: MyProfile)` — sets profile, clears error, updates `lastLoadedAt` (a PATCH response is as fresh as a GET). Reuse the internal setState.
- [ ] **Task 3 — Sheet** (`features/profile/components/EditNameSheet.tsx`, new): AddCustomerSheet chrome; props `{ visible, currentName: string | null, onClose }`; submit per AC 3/4 (calls updateMe + setProfileFromServer internally — self-contained).
- [ ] **Task 4 — Entry points**: MoreScreen account row gains the Pencil IconButton (44px target, `accessibilityLabel="Edit name"`); technicianApp/ProfileScreen identity card gains the same (locate its name render — add the affordance in the same visual language).
- [ ] **Task 5 — Tests**: Save disabled on unchanged/empty; success path calls setProfileFromServer with the response; 422 keeps sheet open with message.

## Dev Notes

- Smallest story in the plan — keep it that way. No avatar, no phone edit (phone is login identity; BE has no endpoint).
- Do NOT call `loadMyProfile()` after the PATCH — the response IS the fresh profile (one request, not two).
- Files: NEW `features/profile/components/EditNameSheet.tsx`; MODIFY `services/resources/users.ts` + barrel, `features/profile/useMyProfile.ts`, `features/profile/index.ts`, `features/more/MoreScreen.tsx`, `features/technicianApp/ProfileScreen.tsx`; tests.
- [Source: api-contracts.md §14; fenzit-be src/users/dto/update-profile.dto.ts (trim + 1..100); fenzit-be users.controller PATCH returns full profile].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
