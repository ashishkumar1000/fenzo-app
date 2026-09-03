# Story 5.3: Session Expiry & Global 401 Handling

Status: ready-for-dev

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

- [ ] **Task 1 — Reset registry** (`src/services/resetRegistry.ts`, new; keeps `services/` free of `features/` imports):
  ```ts
  const resets = new Set<() => void>();
  export function registerReset(fn: () => void): () => void { resets.add(fn); return () => resets.delete(fn); }
  export function runAllResets(): void { resets.forEach(fn => { try { fn(); } catch (e) { console.warn('reset failed', e); } }); }
  ```
  Each store registers at module scope: `registerReset(clearCustomers)` in useCustomers.ts, likewise useMyProfile (`clear`), useJobs (`clearJobs`), useTechnicianJobs (`clearTechnicianJobs`), useSkills (`clearSkills`), useTechnicians (`clear`). NOTE: syncStore/actionQueue register an IN-MEMORY reset only (drop loaded state), never their MMKV wipe (AC 4).
- [ ] **Task 2 — Auth store expiry** (`features/auth/useAuth.ts`): add module-level `sessionExpired` flag to the store state (not persisted): `expireSession()` → `setSession(null)` + `sessionExpired = true` + notify; `complete()` clears the flag; export `useSessionExpired()` or fold into `useAuth()` return.
- [ ] **Task 3 — Wire the hook** (`src/App.tsx`): one mount effect:
  ```ts
  useEffect(() => { setOnUnauthorized(() => { runAllResets(); expireSession(); }); return () => setOnUnauthorized(null); }, []);
  ```
  (Order: resets first, gate flip second — screens unmount into a clean world.)
- [ ] **Task 4 — Login notice**: locate the auth flow's first screen (PhoneScreen in features/auth) and render a dismissible InlineError-styled notice when `sessionExpired` — cleared on dismiss or successful verify.
- [ ] **Task 5 — Listener hygiene check**: 4.1's AppState listener and 4.3's NetInfo start are technician-session-scoped (syncBootstrap) — confirm their cleanup runs when the technician tree unmounts on expiry (React cleanup in the bootstrap component/effect); add if missing.
- [ ] **Task 6 — Tests**: registry runs all + survives a throwing reset; two concurrent 401s → one flow (mock axios interceptor path or unit-test the exported handler wrapper); login-401 (no token) does not fire; sessionExpired lifecycle (set on expire, cleared on complete).
- [ ] **Task 7 — Manual recipe** (record results in Dev Agent Record): log in → tamper the MMKV token (temporary debug button calling `setAuthToken('garbage')`) → pull-to-refresh anywhere → assert: login screen + notice, no crash; log back in → everything reloads clean.

## Dev Notes

- The auth gate is App.tsx conditional rendering, NOT navigation state — resetting the session store is sufficient to land on AuthFlow; no navigation.reset call exists or is needed.
- `defaultMessageForStatus(401)` already says "Your session has expired…" for the FAILING REQUEST's error surface; the persistent notice on PhoneScreen is the user-facing explanation (both fine together).
- Session key bump (fenzit.session.v2) from 4.1 means expiry pre-4.1 vs post-4.1 both work — no coupling.
- Files: NEW `src/services/resetRegistry.ts`; MODIFY `src/App.tsx`, `features/auth/useAuth.ts`, auth PhoneScreen, every store file (one registerReset line each), `features/technicianApp/syncBootstrap.ts` (cleanup check); tests.
- [Source: services/api/apiClient.ts L32–102 (read before coding); epics.md Review Note 2; 4-1/4-2 per-user key design].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
