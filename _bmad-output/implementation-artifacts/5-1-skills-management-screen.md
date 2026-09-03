# Story 5.1: Skills Management Screen

Status: ready-for-dev

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

- [ ] **Task 1 — Verify service** (`services/resources/skills.ts`): confirm `list(): Promise<Skill[]>` (plain array per contract), `create({ name })`, `remove(id)` exist with correct types; the file's own warning says do NOT use inherited update — respect it. Fix the list return type if it wrongly unwraps an envelope.
- [ ] **Task 2 — Store** (`features/skills/useSkills.ts`, new; Story 1.1 skeleton): state `{ skills, isLoading, error, hasLoaded, lastLoadedAt }`; `loadSkills(opts)`, `addSkill(name)` (create → insert-sorted), `removeSkill(id)` (optimistic + rollback per AC 4), `clearSkills()`.
- [ ] **Task 3 — Navigation** (`navigation/types.ts` + `RootNavigator.tsx`): `Skills: undefined`; register.
- [ ] **Task 4 — Screen + sheet** (`features/skills/SkillsScreen.tsx`, `features/skills/components/AddSkillSheet.tsx`, `features/skills/index.ts`, new): per ACs 2–4; delete uses the MoreScreen Alert pattern verbatim.
- [ ] **Task 5 — More tile** (`features/more/MoreScreen.tsx`): add the Skills row (reuse the Settings-row structure with ChevronRight).
- [ ] **Task 6 — Invite unification** (`features/technicians/components/AddTechnicianSheet.tsx`): remove the internal `skillService.list()` effect; consume `useSkills()` (`loadSkills()` on `visible === true`); the MAX_SKILLS=20 client cap stays.
- [ ] **Task 7 — Tests**: alphabetical insert on add; optimistic remove rollback on failure; 404 delete stays removed; 409 create keeps sheet open with copy.

## Dev Notes

- Rename = delete + re-add in Phase 1 (no PATCH) — do not fake it client-side.
- The delete-warning copy IS the contract for the cascade; nothing else to handle client-side.
- Sentence case everywhere ("Manage service skills", "Delete skill").
- Files: NEW `features/skills/{useSkills.ts,SkillsScreen.tsx,components/AddSkillSheet.tsx,index.ts}`; MODIFY `navigation/types.ts`, `navigation/RootNavigator.tsx`, `features/more/MoreScreen.tsx`, `features/technicians/components/AddTechnicianSheet.tsx`, `services/resources/skills.ts` (type check only); tests.
- [Source: api-contracts.md §15; fenzit-be skills.service.ts (23505→409 L51–56, cascade delete L141–155); AddTechnicianSheet current skill fetch; AddCustomerSheet chrome].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
