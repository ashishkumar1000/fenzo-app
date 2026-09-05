# Story 5.3: Session Expiry & Global 401 Handling

Status: done

## Story

As a user with a week-old session,
I want a clean, explained path back to login when my token expires,
so that the app never hangs, crashes, or silently fails.

## Existing infrastructure (verified — do NOT rebuild)

`services/api/apiClient.ts` L32–102 already ships: `setOnUnauthorized(handler)` registration; a response interceptor that fires the handler ONLY when a token was attached (`hadToken` guard — login 401s never trigger it); single-fire dedup across concurrent 401s (`handlingUnauthorized` flag, reset next tick); `clearAuthToken()` after the handler. This story WIRES it and defines what "logout" resets.

## UI Design (ui-design-spec.md §14)

Session-expired notice on PhoneScreen, above the form: banner with bg status.cancelled.bg, border .border, radius.md, padding s3; row gap s2 = Info 16 cancelled.fg + bodySm cancelled.fg "Session expired — please log in again." + trailing dismiss IconButton(X 16). This is the ONE place expiry uses the red family — it is a real, actionable event, not a pending state.

## Acceptance Criteria

1. **Given** any authenticated request returning 401, **then** exactly one global expiry flow runs: every registered store reset executes, the auth gate resets (NavigationContainer unmounts via App.tsx's conditional), and the login (PhoneScreen) shows a dismissible notice "Session expired — please log in again."
2. **Given** several in-flight requests all 401ing, **then** the flow runs once (existing dedup — covered by a test with two simultaneous rejections).
3. **Given** a 401 on the OTP endpoints themselves (no token attached), **then** nothing global fires and the inline login error behaviour is unchanged.
4. **Given** the technician action queue + sync store, **then** forced expiry does NOT wipe them (per-user MMKV keys survive; 4.1's user-change wipe on next login is the only queue-clearing path); all in-memory stores DO reset.
5. **Given** a fresh login after expiry, **then** no stale data from the previous session is visible at any point (profile, customers, jobs, technician lists, skills all reload from empty).
6. **Given** future stores, **then** they join the reset by registering themselves — the wiring never needs another edit (registry pattern).

## Tasks / Subtasks

- [x] **Task 1 — Reset registry** (`src/services/resetRegistry.ts`, new; keeps `services/` free of `features/` imports):
  ```ts
  const resets = new Set<() => void>();
  export function registerReset(fn: () => void): () => void { resets.add(fn); return () => resets.delete(fn); }
  export function runAllResets(): void { resets.forEach(fn => { try { fn(); } catch (e) { console.warn('reset failed', e); } }); }
  ```
  Each store registers at module scope: `registerReset(clearCustomers)` in useCustomers.ts, likewise useMyProfile (`clear`), useJobs (`clearJobs`), useTechnicianJobs (`clearTechnicianJobs`), useSkills (`clearSkills`), useTechnicians (`clear`). NOTE: syncStore/actionQueue register an IN-MEMORY reset only (drop loaded state), never their MMKV wipe (AC 4).
- [x] **Task 2 — Auth store expiry** (`features/auth/useAuth.ts`): add module-level `sessionExpired` flag to the store state (not persisted): `expireSession()` → `setSession(null)` + `sessionExpired = true` + notify; `complete()` clears the flag; export `useSessionExpired()` or fold into `useAuth()` return.
- [x] **Task 3 — Wire the hook** (`src/App.tsx`): one mount effect:
  ```ts
  useEffect(() => { setOnUnauthorized(() => { runAllResets(); expireSession(); }); return () => setOnUnauthorized(null); }, []);
  ```
  (Order: resets first, gate flip second — screens unmount into a clean world.)
- [x] **Task 4 — Login notice**: locate the auth flow's first screen (PhoneScreen in features/auth) and render a dismissible InlineError-styled notice when `sessionExpired` — cleared on dismiss or successful verify.
- [x] **Task 5 — Listener hygiene check**: 4.1's AppState listener and 4.3's NetInfo start are technician-session-scoped (syncBootstrap) — confirm their cleanup runs when the technician tree unmounts on expiry (React cleanup in the bootstrap component/effect); add if missing. *(N/A — Epic 4 not built yet; see Completion Notes.)*
- [x] **Task 6 — Tests**: registry runs all + survives a throwing reset; two concurrent 401s → one flow (mock axios interceptor path or unit-test the exported handler wrapper); login-401 (no token) does not fire; sessionExpired lifecycle (set on expire, cleared on complete).
- [x] **Task 7 — Manual recipe** (record results in Dev Agent Record): log in → tamper the MMKV token (temporary debug button calling `setAuthToken('garbage')`) → pull-to-refresh anywhere → assert: login screen + notice, no crash; log back in → everything reloads clean. *(Not run on device — accepted as covered by unit + composed integration tests, per review decision 2026-09-05. On-device smoke folded into the pre-launch pass.)*

### Review Findings

- [x] [Review][Decision] Task 7 manual recipe not run — the only real-world check of AC 1/AC 5 (expiry → login screen + notice → clean re-login). Needs a device/simulator pass; unit tests cover the pieces but not the end-to-end path. **→ Dismissed 2026-09-05: unit + composed integration coverage accepted as sufficient pre-launch; on-device smoke folded into the pre-launch pass.**
- [x] [Review][Patch] Manual logout leaves the auth token in storage and hand-rolls store lists instead of the registry [src/features/more/MoreScreen.tsx:47, src/features/technicianApp/ProfileScreen.tsx:47] — `handleLogOut` in both screens clears stores + `reset()` but never `clearAuthToken()`, so the JWT stays attached to later requests (including login/OTP ones). Also, both screens duplicate the reset list that `runAllResets()` now owns — the two lists drift the first time a future store registers (AC 6). **→ Applied 2026-09-05: both screens now `clearAuthToken(); runAllResets(); reset()`; hand-rolled lists and their imports removed.**
- [x] [Review][Patch] No test composes the App.tsx 401 wiring [src/App.tsx:32] — the three pieces (apiClient interceptor, runAllResets, expireSession) are tested in isolation; deleting the App effect or reordering it passes every suite. Add an integration test: render App with a 401 adapter and assert the gate flips and stores reset. **→ Applied 2026-09-05: `__tests__/app-401-wiring.test.tsx` (gate flip, banner, stores emptied post-401).**
- [x] [Review][Patch] runAllResets never exercised against the real stores [src/services/resetRegistry.test.ts] — registry tests use bare jest.fn() stubs; a store's `registerReset` line can be dropped (or replaced with a no-op) with zero test or compile signal, silently breaking AC 5 for that store. **→ Applied 2026-09-05: `__tests__/reset-registry-stores.test.tsx` mounts all six real stores and pins every reset.**
- [x] [Review][Patch] Missing late-response-after-clear tests for customers/profile [src/features/customers/useCustomers.ts:202, src/features/profile/useMyProfile.ts:177] — the hoisted clears now invalidate in-flight GETs, but no test drives a clear against a pending request (sibling stores useSkills/useTechnicianJobs have exactly this test). **→ Applied 2026-09-05: logout-race + reset-state tests added to both store suites.**
- [x] [Review][Patch] PhoneScreen session-expired banner has no render test [src/features/auth/screens/PhoneScreen.tsx:65] — the story's only new UI (notice text, dismiss wiring) is untested; a regression to a silent, unexplained return to login would go unnoticed. **→ Applied 2026-09-05: `src/features/auth/screens/PhoneScreen.test.tsx` (copy, default-absent, dismiss callback).**
- [x] [Review][Patch] useAuth.test.tsx: dead barrel mock + order-sensitive state [src/features/auth/useAuth.test.tsx] — the suite mocks the `services` barrel, but useAuth imports `storage` from the leaf `services/storage` (the real storage is mocked by the global `__mocks__/react-native-mmkv.ts`); the mock factory is dead code and the file header misdescribes it. Also module-level store state leaks across the file's tests (test 2 passes on leftover state). **→ Applied 2026-09-05: dead mock removed, header corrected, `beforeEach` resets store + flag for order-independence.**
- [x] [Review][Patch] expireSession() notify logic is redundant [src/features/auth/useAuth.ts] — `setSession(null)` already notifies all subscribers unconditionally; the `wasExpired` guard + extra notify is dead weight. Simplify. **→ Applied 2026-09-05.**
- [x] [Review][Patch] runAllResets log doesn't identify the failing reset [src/services/resetRegistry.ts:46] — a throwing reset is logged with no name, undiagnosable in production. **→ Applied 2026-09-05: log now includes `fn.name`.**
- [x] [Review][Patch] Four new files missing a trailing newline [src/services/resetRegistry.ts, src/services/resetRegistry.test.ts, src/services/api/apiClient.test.ts, src/features/auth/useAuth.test.tsx] **→ Applied 2026-09-05.**
- [x] [Review][Patch] Story doc contradictions: "All 7 tasks implemented" conflicts with the Task 5 N/A / Task 7 not-run notes; task checkboxes still all `[ ]` while status is `review`; UI-spec §14 geometry deviations (radius.md→lg, padding s3→s2, message colour) undocumented beyond the icon swap. **→ Applied 2026-09-05: checkboxes reconciled with reality, completion notes rewritten, geometry deviations documented.**
- [x] [Review][Defer] A 401 from an OLD session can settle after a fresh re-login and wipe the new session [src/services/api/apiClient.ts, src/App.tsx:32] — deferred, pre-existing: the dedup re-arms on a tick with no session-generation guard; closing it needs per-request token identity (a rebuild of the interceptor, which this story explicitly forbids). Old-session requests settle within the API timeout — practically unreachable before a manual re-login completes — but worth a session-gen guard when Epic 4 touches this code.
- [x] [Review][Defer] Registry has no ordering/async contract for future resets [src/services/resetRegistry.ts] — deferred, pre-existing: today's resets are order-independent; Epic 4's sync store may need ordering/async semantics. Document when that store lands.

## Dev Notes

- The auth gate is App.tsx conditional rendering, NOT navigation state — resetting the session store is sufficient to land on AuthFlow; no navigation.reset call exists or is needed.
- `defaultMessageForStatus(401)` already says "Your session has expired…" for the FAILING REQUEST's error surface; the persistent notice on PhoneScreen is the user-facing explanation (both fine together).
- Session key bump (fenzit.session.v2) from 4.1 means expiry pre-4.1 vs post-4.1 both work — no coupling.
- Files: NEW `src/services/resetRegistry.ts`; MODIFY `src/App.tsx`, `features/auth/useAuth.ts`, auth PhoneScreen, every store file (one registerReset line each), `features/technicianApp/syncBootstrap.ts` (cleanup check); tests.
- [Source: services/api/apiClient.ts L32–102 (read before coding); epics.md Review Note 2; 4-1/4-2 per-user key design].

## Dev Agent Record

### Agent Model Used

Claude Code (GLM)

### Debug Log References

- Test iteration (2026-09-05, patch application): the new "clear → pre-login state" store tests initially failed because a mounted probe's auto-load effect refires when the clear flips `hasLoaded`/data back and the refetch repopulates the store — on a real logout the gate unmounts the screens first. Both tests (and reset-registry-stores) now hang the loaders after the seeded load so the refires never settle; the pre-login snapshot is pinned exactly.
- Discovery: a bare `SafeAreaProvider` (no native metrics in jest) renders NO children, so `App.test.tsx`'s "renders correctly" never actually rendered app content. `app-401-wiring.test.tsx` partial-mocks `react-native-safe-area-context` (provider passes children through, insets = zeros) to make App's tree visible.

### Completion Notes List

- Tasks 1–4 and 6 implemented; Task 5 N/A (below); Task 7 not run on device (below). Post-review (2026-09-05): all 10 review patches applied — manual logout now uses the registry + clears the token, App wiring/registry-vs-stores/banner/logout-race tests added, expiry notify simplified. `bun run test` and `tsc --noEmit` re-run green after the patches. (`bun run lint` is broken repo-wide pre-existing — no eslint config in the repo, unrelated to this story.)
- **Task 5 (listener hygiene) is N/A**: Epic 4 (4.1–4.3 — syncStore, actionQueue, syncBootstrap) is not implemented yet (plan reordered so 5.1–5.3 ship before Epic 4). There are no session-scoped AppState/NetInfo listeners yet; the MMKV-survival guarantee (AC 4) is enforced structurally — no sync store exists to wipe. When 4.1/4.3 land, syncBootstrap must (a) register an IN-MEMORY-only reset in the registry and (b) own its listener cleanup on the technician tree unmount.
- **AC 4 note**: with Epic 4 absent, every current store is session data and all are reset (useCustomers, useMyProfile, useJobs, useTechnicianJobs, useSkills, useTechnicians). useTechnicians persists to MMKV and its reset writes `[]` — intentional, it is not per-user-keyed and clearing it matches the existing logout `clear` behavior.
- **Deviation — direct file import**: stores import `registerReset` from `../../services/resetRegistry` (the file) rather than the `services` barrel. Reason: nine existing suites mock the barrel with partial factories; a barrel import at module scope would crash those suites with `registerReset is undefined` unless every mock factory added the export. Direct import of the zero-dependency leaf keeps the registry pattern while leaving test mocks untouched. The barrel still re-exports it for other consumers.
- **Deviation — banner icon**: reused the existing DS `InlineError` component (AlertTriangle 18) instead of the spec's Info 16 — the story says "InlineError-styled notice", and the DS component is the consistent choice over a one-off banner build. Copy matches spec exactly.
- **Deviation — §14 geometry (InlineError's own metrics, not §14's)**: the DS component renders radius.lg (not radius.md), padding s2/s3/s1 (not uniform s3), and bodySm in palette.red800 (not cancelled.fg) for the message. All four are InlineError's existing, DS-consistent styling — the reuse keeps every banner in the app identical; deviating per-screen would fork the pattern.
- **Deviation — notice props**: PhoneScreen stays presentational; `sessionExpired` + `onDismissSessionExpired` are props threaded from AuthFlow (which reads `useSessionExpired()`/`clearSessionExpired()`).
- Store clears extended where the hook-only `clear` was insufficient for a module-scope registration: `clearCustomers`, `clearMyProfile`, `clearTechnicians` were hoisted to module scope; customers/profile clears also bump `requestSeq`/null `inFlight` so a late response can't repopulate the next session (same guard jobs/skills/technicianJobs already had).
- Task 7 (manual recipe) NOT run — **review decision 2026-09-05: dismissed, unit + composed integration coverage accepted as sufficient pre-launch** (the App 401-wiring test, the registry-vs-real-stores test and the banner render test pin the end-to-end path at the component level; the only untested delta is real-device quirks). On-device smoke is folded into the pre-launch pass. The `setAuthToken('garbage')` debug button was not added to production code.

### File List

**New:**
- src/services/resetRegistry.ts
- src/services/resetRegistry.test.ts
- src/services/api/apiClient.test.ts
- src/features/auth/useAuth.test.tsx
- src/features/auth/screens/PhoneScreen.test.tsx (review patch)
- __tests__/reset-registry-stores.test.tsx (review patch)
- __tests__/app-401-wiring.test.tsx (review patch)

**Modified:**
- src/App.tsx (global 401 wiring effect)
- src/features/auth/useAuth.ts (sessionExpired flag, expireSession, clearSessionExpired, useSessionExpired; complete() clears the flag)
- src/features/auth/index.ts (barrel exports)
- src/features/auth/AuthFlow.tsx (reads the flag, passes notice props to PhoneScreen)
- src/features/auth/screens/PhoneScreen.tsx (dismissible InlineError notice above the form)
- src/services/index.ts (barrel exports registerReset/runAllResets)
- src/features/customers/useCustomers.ts (clearCustomers + registerReset)
- src/features/profile/useMyProfile.ts (clearMyProfile + registerReset)
- src/features/technicians/useTechnicians.ts (clearTechnicians + registerReset)
- src/features/jobs/useJobs.ts (registerReset(clearJobs))
- src/features/skills/useSkills.ts (registerReset(clearSkills))
- src/features/technicianApp/useTechnicianJobs.ts (registerReset(clearTechnicianJobs))
- src/features/more/MoreScreen.tsx (review patch: logout → registry + clearAuthToken)
- src/features/technicianApp/ProfileScreen.tsx (review patch: logout → registry + clearAuthToken)
- __tests__/useCustomers.test.ts, __tests__/useMyProfile.test.ts (review patch: logout-race tests)
- _bmad-output/implementation-artifacts/sprint-status.yaml (5-3 → review)

## Change Log

- 2026-09-05: Story 5.3 implemented — reset registry, session-expiry flag in useAuth, global 401 wiring in App.tsx, session-expired notice on PhoneScreen, tests (registry, concurrent-401 dedup, login-401 no-fire, expiry lifecycle). Status → review.
- 2026-09-05: BMAD code review closed — 1 decision (Task 7 dismissed: unit + composed integration coverage accepted; on-device smoke → pre-launch pass), 10 patches applied (logout → registry + clearAuthToken; App-wiring, registry-vs-stores, banner, logout-race tests; test/doc cleanups), 2 defers logged in deferred-work.md. Status → done.
