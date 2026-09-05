# Story 5.1: Skills Management Screen

Status: done
baseline_commit: f006df54e582bff049e16104a40616f3998b3821

## Story

As an owner,
I want to manage my tenant's skill list from the More tab,
so that the invite flow's skill picker always offers the right options.

## API Contract (api-contracts.md §15)

`GET /skills` → **plain array** `Skill[] { id, name, tenantId, createdAt }` (NOT a Paginated envelope — verify the FE `skillService.list` return type matches). `POST /skills { name }` → 201 Skill; 409 `DUPLICATE_RESOURCE` "A skill with this name already exists for your company" (unique per tenant, case-insensitive, server-trimmed, ≤100). `DELETE /skills/:id` → `{ success: true }`; 404; CASCADES to user_skills (technicians silently lose it). No PATCH exists — no rename UX.

## UI Design (ui-design-spec.md §13)

More tile: Settings-row structure — 36px radius.md icon box primarySoft bg + Wrench 18 primary, heading@16 "Skills", bodySm muted "Manage service skills", ChevronRight. SkillsScreen: back header "Skills" + right Button primary sm "Add"; rows = Card md (bodyStrong name + caption "Added 12 Aug 2026", trailing Trash2 IconButton in colors.danger, 44px), separator s3; EmptyState(Wrench) "No skills yet" / "Add skills so you can assign them to technicians." + primary "Add a skill". AddSkillSheet: standard sheet chrome, title "Add a skill", Input placeholder "e.g. AC repair" autoFocus maxLength 100, duplicate error bodySm danger "This skill already exists", footer Button primary lg fullWidth "Add skill". Delete confirm = native Alert per contract cascade copy. All strings in spec §15.

## Acceptance Criteria

1. **Given** the More tab, **then** a new "Skills" row (Settings-row pattern, Wrench lucide icon, subtitle "Manage service skills") sits above the Settings row and navigates to a new `Skills` route (RootStack, back header).
2. **Given** SkillsScreen, **then** all skills list alphabetically (case-insensitive `localeCompare`) as rows: name + created date (`toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })`) + trailing Trash2 IconButton; loading spinner / EmptyState "No skills yet — add your first" / InlineError+retry per app pattern; header "+ Add" Button opens AddSkillSheet.
3. **Given** AddSkillSheet (chrome copied from AddCustomerSheet: Modal, grabber, KeyboardAvoidingView), **then** one Input (autoFocus, maxLength 100); Save disabled when trimmed-empty; success → sheet closes, list re-sorts with the new skill; 409 → inline "This skill already exists" (sheet stays open); other errors → `ApiError.message` inline.
4. **Given** a Trash2 tap, **then** `Alert.alert('Delete skill', 'It will also be removed from any technicians who have it.', [Cancel, Delete (destructive)])`; confirm → optimistic row removal → `DELETE`; failure (except 404) → row restored + error banner; 404 → stays removed (already gone elsewhere).
5. **Given** the invite flow opens after changes, **then** AddTechnicianSheet's MultiSelect reflects them: it switches from its private `skillService.list()` fetch (current code fetches inside the sheet) to the shared `useSkills` store with a `loadSkills()` on sheet-open (force: false — the store dedupes).
6. **Given** logout, **then** `clearSkills()` joins the MoreScreen clear list.

## Tasks / Subtasks

- [x] **Task 1 — Verify service** (`services/resources/skills.ts`): confirm `list(): Promise<Skill[]>` (plain array per contract), `create({ name })`, `remove(id)` exist with correct types; the file's own warning says do NOT use inherited update — respect it. Fix the list return type if it wrongly unwraps an envelope.
- [x] **Task 2 — Store** (`features/skills/useSkills.ts`, new; Story 1.1 skeleton): state `{ skills, isLoading, error, hasLoaded, lastLoadedAt }`; `loadSkills(opts)`, `addSkill(name)` (create → insert-sorted), `removeSkill(id)` (optimistic + rollback per AC 4), `clearSkills()`.
- [x] **Task 3 — Navigation** (`navigation/types.ts` + `RootNavigator.tsx`): `Skills: undefined`; register.
- [x] **Task 4 — Screen + sheet** (`features/skills/SkillsScreen.tsx`, `features/skills/components/AddSkillSheet.tsx`, `features/skills/index.ts`, new): per ACs 2–4; delete uses the MoreScreen Alert pattern verbatim.
- [x] **Task 5 — More tile** (`features/more/MoreScreen.tsx`): add the Skills row (reuse the Settings-row structure with ChevronRight).
- [x] **Task 6 — Invite unification** (`features/technicians/components/AddTechnicianSheet.tsx`): remove the internal `skillService.list()` effect; consume `useSkills()` (`loadSkills()` on `visible === true`); the MAX_SKILLS=20 client cap stays.
- [x] **Task 7 — Tests**: alphabetical insert on add; optimistic remove rollback on failure; 404 delete stays removed; 409 create keeps sheet open with copy.

### Review Findings

- [x] [Review][Decision] AC 2 copy conflicts with ui-design-spec §13 — **Resolved by user: rebuild the UI to AC 2's literal wording.** Empty-state title is now "No skills yet — add your first"; load errors follow the app's InlineError+retry pattern (dismissible banner over rows, error EmptyState with "Try again" + pull-to-refresh when empty).
- [x] [Review][Patch] clearSkills leaves the in-flight GET running and stale-seq state; a response landing after logout repopulates the store with the previous tenant's skills [src/features/skills/useSkills.ts:209] — fixed: bumps `requestSeq` and clears `inFlight`.
- [x] [Review][Patch] removeSkill rollback restores the whole pre-delete snapshot, resurrecting skills deleted concurrently by another path [src/features/skills/useSkills.ts:189] — fixed: restores only the removed row.
- [x] [Review][Patch] addSkill/removeSkill don't bump requestSeq, so a GET started before the mutation can settle after it and overwrite the mutation's result [src/features/skills/useSkills.ts:171] — fixed: success path bumps `requestSeq` and re-asserts the mutation.
- [x] [Review][Patch] Store load error is only rendered in ListEmptyComponent — a failed refresh is invisible whenever rows are on screen [src/features/skills/SkillsScreen.tsx:135] — fixed: dismissible InlineError banner over rows (CustomersScreen pattern).
- [x] [Review][Patch] deleteError is cleared by a useEffect on the store's load `error` (unrelated trigger) and never cleared after a successful delete retry [src/features/skills/SkillsScreen.tsx:54] — fixed: clears on delete success, no store-error coupling.
- [x] [Review][Patch] AddSkillSheet non-ApiError rejection renders `err.message` which may be undefined — needs a fallback string [src/features/skills/components/AddSkillSheet.tsx:40] — fixed.
- [x] [Review][Patch] AddTechnicianSheet helper copy still says "add one from Settings first" — the Skills screen now lives under the More tab, not Settings [src/features/technicians/components/AddTechnicianSheet.tsx:127] — fixed.
- [x] [Review][Patch] Test gaps: AddTechnicianSheet loadSkills-on-visible wiring, clearSkills resetting the TTL throttle, SkillsScreen render states (loading/empty/error/retry) — added: `SkillsScreen.test.tsx` (4), `AddTechnicianSheet.test.tsx` (2), plus 4 store race tests (logout race, mutation-vs-GET, concurrent-delete rollback).
- [x] [Review][Patch] All 6 new files are missing trailing newlines [src/features/skills/] — fixed.
- [x] [Review][Patch] sprint-status.yaml `last_updated` comment says "5-1 in-progress (dev-story)" — stale status text [\_bmad-output/implementation-artifacts/sprint-status.yaml:2] — fixed.

## Dev Notes

- Rename = delete + re-add in Phase 1 (no PATCH) — do not fake it client-side.
- The delete-warning copy IS the contract for the cascade; nothing else to handle client-side.
- Sentence case everywhere ("Manage service skills", "Delete skill").
- Files: NEW `features/skills/{useSkills.ts,SkillsScreen.tsx,components/AddSkillSheet.tsx,index.ts}`; MODIFY `navigation/types.ts`, `navigation/RootNavigator.tsx`, `features/more/MoreScreen.tsx`, `features/technicians/components/AddTechnicianSheet.tsx`, `services/resources/skills.ts` (type check only); tests.
- [Source: api-contracts.md §15; fenzit-be skills.service.ts (23505→409 L51–56, cascade delete L141–155); AddTechnicianSheet current skill fetch; AddCustomerSheet chrome].

## Dev Agent Record

### Agent Model Used

Claude Code (glm-5.3-flash:cloud)

### Debug Log References

- `bun run test src/features/skills/` — 15 tests pass (useSkills store 12, AddSkillSheet 3)
- `bun run test` — full suite: 51 suites, 470 tests pass (post-review: +2 suites, +9 tests)
- `bunx tsc --noEmit` — clean
- `bun run lint` — repo has no ESLint config (pre-existing; script fails for any run, not story-related)

### Completion Notes List

- **Task 1 (verify only):** `skillService` was already correct — `ApiService.list` types `T[]` (plain array, matching the contract), `create({ name })` → `Promise<Skill>`, `remove(id)`; `.update()` stays unused per the file's own warning. No changes.
- **Task 2:** `useSkills` follows the `useCustomers` shared-store pattern (`useSyncExternalStore`, in-flight dedupe, `FOCUS_REFRESH_TTL_MS` throttle, request-seq guarding). List is kept alphabetically sorted (case-insensitive `localeCompare`, `sensitivity: 'base'` + case tie-break) on load, insert and rollback. `removeSkill` is optimistic; failure restores the sorted row and rethrows, except 404 which resolves and stays removed. `addSkill` rethrows `ApiError` (409 `DUPLICATE_RESOURCE`) so the sheet can stay open.
- **Task 3:** `Skills: undefined` added to `RootStackParamList`; registered in `RootNavigator` with `headerShown: false` like the other full-screen routes.
- **Task 4:** `SkillsScreen` copies the TechniciansScreen back-header pattern (Pressable + ArrowLeft), loading spinner / EmptyState (with "Add a skill" CTA) / error EmptyState with retry / delete-failure `InlineError` banner. Delete confirm uses the native Alert with the contract cascade copy verbatim. `AddSkillSheet` copies the AddCustomerSheet chrome (Modal, grabber, KeyboardAvoidingView, header X); `autoFocus` required extending the design-system `Input`'s `TextInputProps` Pick with `'autoFocus'` (pass-through only, no visual change).
- **Task 5:** Skills row added above Settings in MoreScreen using the same row structure, with the spec's 36px `radius.md` `primarySoft` icon box and Wrench icon; navigates to `Skills`. `clearSkills()` joins the logout clear list (AC 6).
- **Task 6:** AddTechnicianSheet no longer fetches privately — it consumes `useSkills()` and calls `loadSkills()` on `visible === true` (unforced; store dedupes/throttles). MAX_SKILLS=20 cap untouched.
- **Task 7:** Store tests cover alphabetical insert, optimistic rollback on failure, 404-stays-removed, 409 rejection propagation, load dedupe and clear. Sheet tests cover the 409-keeps-open-with-copy contract and success-closes-resets.
- **Infra note:** `jest.config.js` gained `watchman: false` — watchman's state dir outside the repo breaks under sandboxed environments; jest's own crawler is used instead. Unrelated to feature code but included in File List for transparency.
- Not committed (awaiting review per project rules).

### File List

- `src/features/skills/useSkills.ts` (NEW)
- `src/features/skills/useSkills.test.tsx` (NEW)
- `src/features/skills/SkillsScreen.tsx` (NEW)
- `src/features/skills/index.ts` (NEW)
- `src/features/skills/components/AddSkillSheet.tsx` (NEW)
- `src/features/skills/components/AddSkillSheet.test.tsx` (NEW)
- `src/navigation/types.ts` (MODIFIED)
- `src/navigation/RootNavigator.tsx` (MODIFIED)
- `src/features/more/MoreScreen.tsx` (MODIFIED)
- `src/features/technicians/components/AddTechnicianSheet.tsx` (MODIFIED)
- `src/components/ui/Input.tsx` (MODIFIED — `autoFocus` pass-through)
- `jest.config.js` (MODIFIED — `watchman: false`)

## Change Log

- 2026-09-05: Story 5.1 implemented — Skills management screen (list/add/delete via shared useSkills store), More tab tile, invite-flow skill picker unified onto the shared store, 11 new tests, full suite green (461 tests). Status → review.
- 2026-09-05: Code review (4-layer adversarial) — 1 decision (AC 2 wording wins; UI rebuilt: "No skills yet — add your first" title, InlineError+retry load-error pattern with pull-to-refresh) and 10 patches applied: store races fixed (clearSkills invalidates in-flight GET + seq; rollback restores only the removed row; mutations invalidate pre-mutation GETs), load-error banner over rows, deleteError decoupled and cleared on success, non-ApiError fallback in AddSkillSheet, AddTechnicianSheet helper copy, 9 new tests across 3 files, trailing newlines, sprint-status comment. Full suite 470 tests green, tsc clean. Status → done.
