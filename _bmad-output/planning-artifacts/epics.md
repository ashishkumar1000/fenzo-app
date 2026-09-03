---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-fenzo-app-2026-09-01/prd.md
  - _bmad-output/planning-artifacts/api-contracts.md
  - _bmad-output/planning-artifacts/ui-design-spec.md
  - ../../backend/fenzit-be/_bmad-output/planning-artifacts/prds/prd-fenzo-be-2026-06-17/prd.md
  - ../../backend/fenzit-be/_bmad-output/planning-artifacts/epics.md
  - ../../backend/fenzit-be/_bmad-output/implementation-artifacts/deferred-work.md
---

# fenzo-app — Epic Breakdown (Frontend Completion, Phase 1 MVP)

## Overview

Decomposes the frontend-completion PRD into implementable stories. The backend is complete and deployed; every story here consumes an existing endpoint. Order is deliberate: owner job board first (it is the visual verification surface for everything downstream), then customer depth, then technician execution online, then offline, then account/session polish.

Story files live in `_bmad-output/implementation-artifacts/` at status `ready-for-dev`. Sprint tracking in `sprint-status.yaml`.

## Epic Review Notes (2026-09-01)

Findings from reviewing the epic plan against the actual codebase before story creation. These constrain the stories:

1. **The local `Job` type is a display mock, not an API shape.** `features/jobs/types.ts` has `customerName`, `timeLabel`, `serviceIcon`, `amount` — `amount` does not exist anywhere in the backend (no billing in Phase 1). Story 1.1 must introduce an `ApiJob` type from the real response, a formatter layer (`features/jobs/format.ts`), and update `JobCard`; the `amount` display is removed, not faked.
2. **401 infrastructure already half-exists.** `apiClient.ts` already ships `setOnUnauthorized()` with single-fire dedup and token clearing. Story 5.3 is wiring + store resets + user notice, not new plumbing.
3. **Navigation needs structural additions, not tweaks.** Owner: `JobDetail { jobId }`, `CustomerDetail { customerId }`, `Skills` routes on `RootStackParamList`. Technician: `TechnicianTabs` currently sits bare inside `NavigationContainer` — a `TechnicianRootNavigator` stack must wrap it so `TechJobDetail { jobId }` can push full-screen. Param lists in `navigation/types.ts` change in Stories 1.2, 2.1, 3.2, 5.1.
4. **`useJobs` MMKV store has zero real consumers** (JobsScreen imports the `JOBS` mock directly). It can be replaced wholesale rather than migrated.
5. **`useCustomers` store already exists and is API-backed** — Story 2.2 is a consolidation (CustomersScreen still holds a private duplicate fetch), exactly as the store's own header comment requests.
6. **GET /jobs list-row shape is unverified.** The FE was built against an API reference, not Swagger. First task of Story 1.1 is contract capture from `/api/docs` (or a live call), recorded in the story file, before any typing.
7. **serviceCategories ↔ serviceType mismatch stays.** Lossy mapping documented in `services/resources/jobs.ts` is a backend enum gap; stories render `serviceType` as-is and do not attempt client-side repair. Tracked as a BE dependency, out of FE scope.
8. **Library additions needed** (none installed today): image capture — `react-native-image-picker` (Software Mansion-maintained new-arch support; app is RN 0.86 = new architecture only); signature — `react-native-signature-canvas` + `react-native-webview` (battle-tested, base64 PNG export; native-ink alternative noted in Story 3.5); connectivity — `@react-native-community/netinfo`. All via `bun add`, verified against RN 0.86/React 19.2 before use.
9. **BE quirks the FE must absorb** (from fenzit-be deferred-work): validation 422 `message` can be a string array (CR3) — join in `ApiError`; 409 on workflow conflates terminal-vs-race (CR1) — FE treats every 409 as refetch-and-reconcile; attachment presigned PUT URLs are 15-min TTL and idempotent replay can return a stale one (CR3.6-1) — FE never retries a stale presigned URL, it re-requests from presign.
10. **BE gap found and filed (2026-09-01)**: `GET /customers/:id` still returns the Epic-2 placeholder `jobHistory: []` — never wired after jobs landed (customers.service.ts:426). Filed as fenzit-be Story 2.4 (`2-4-customer-detail-job-history.md`, ready-for-dev; adds real query, page 20, `?cursor=`, and an `id` field on history rows). FE Story 2.1 is buildable against the final envelope but shows real data only after BE 2.4 merges.
11. **All wire shapes are pre-captured.** `_bmad-output/planning-artifacts/api-contracts.md` holds every request/response type extracted from BE source with file citations — stories reference its sections instead of re-deriving contracts. Dev agents must NOT guess shapes; if a contract question isn't answered there, read the cited BE source file.
12. **All visuals are pre-designed (2026-09-01).** `_bmad-output/planning-artifacts/ui-design-spec.md` specifies every new screen/component against the ACTUAL theme source (verified token names — e.g. `StatusKey` is `progress`, not `inProgress`) and established screen patterns, plus a full copy inventory (§15). Each story carries a "## UI Design" section referencing its spec sections. Dev agents must not improvise visuals: if it isn't in the spec or DESIGN_SYSTEM.md, extend tokens first. Design research applied: field-service patterns (progress "N of 6" at a glance, one primary bottom action, checklist never buried) and offline-first UX (pending = calm amber, red reserved for real failure, "Waiting to sync" until server confirms).
13. **Story-split decision.** Considered splitting 3.2 (stepper + screen) after design enrichment; kept single because the visual detail lives in ui-design-spec.md (stories stay one-run implementable) and renumbering would churn cross-references in ~20 files — a stale-reference risk worse than story size. Revisit only if a dev run proves 3.2 too large.

---

## FR Coverage Map

| FE-FR | Epic | Story | Description |
|---|---|---|---|
| FE-FR-1 | 1 | 1.1 | Jobs list wired to GET /jobs |
| FE-FR-2 | 1 | 1.2 | Owner Job Detail screen |
| FE-FR-3 | 1 | 1.3 | Edit / reassign / cancel job |
| FE-FR-4 | 1 | 1.4 | Home stats refresh |
| FE-FR-5 | 2 | 2.1 | Customer Detail screen |
| FE-FR-6 | 2 | 2.2 | Single customer data path |
| FE-FR-9 | 3 | 3.1 | Technician Today & History wired |
| FE-FR-10 | 3 | 3.2 | Technician Job Detail |
| FE-FR-11 | 3 | 3.3 | Workflow advancement |
| FE-FR-12 | 3 | 3.4 | Photo capture & upload |
| FE-FR-13 | 3 | 3.5 | Signature capture |
| FE-FR-14 | 4 | 4.1 | Delta sync store |
| FE-FR-15 | 4 | 4.2 | Offline action queue |
| FE-FR-16 | 4 | 4.3 | Connectivity UX |
| FE-FR-7 | 5 | 5.1 | Skills management screen |
| FE-FR-8 | 5 | 5.2 | Profile edit |
| FE-FR-17 | 5 | 5.3 | Session expiry handling |
| FE-FR-18 | 5 | 5.4 | Error envelope consistency |

---

## Epic 1: Owner Live Job Board

**Goal.** The owner's Jobs tab, job detail, and job editing run entirely on real API data. After this epic, no mock job data exists on the owner side and UJ-1 (create → see → edit → cancel) works end-to-end on device.

**Scope.** `GET /jobs` (filters, cursor pagination, focus refetch, pull-to-refresh), a new full-screen `JobDetail` route (`GET /jobs/:id`: profiles, activity log, attachments), `PATCH /jobs/:id` (edit sheet, reassign picker fed by server technician ids from `/users/me`, cancel with confirm), and Home stat tiles refreshing on focus and after mutations.

**Out of scope.** Realtime push (focus refetch + pull-to-refresh only), technician screens (Epic 3), attachments upload (owner only views).

**Dependencies.** None — first epic. Establishes patterns every later epic reuses: `ApiJob` type + formatter layer, the API-backed shared-store shape for lists, the detail-screen fetch/refresh pattern, and navigation param plumbing.

**Sequencing inside the epic.** 1.1 → 1.2 → 1.3 strictly (each builds on the previous); 1.4 anytime after 1.1.

**Definition of done.** `features/jobs/data.ts` and the MMKV `useJobs` are deleted; Jobs tab shows live data with working filters and pagination; a job created in NewJob appears on return; detail shows the activity log of a job a technician has advanced (verified with a second device or curl); edit/reassign/cancel round-trip with correct 409 handling.

**Stories:** 1.1 Wire Jobs list to GET /jobs · 1.2 Owner Job Detail screen · 1.3 Edit, reassign & cancel · 1.4 Home stats refresh.

---

## Epic 2: Customer Depth

**Goal.** UJ-4 works: the owner opens any customer and sees their profile plus complete job history; the customer list has exactly one data path.

**Scope.** New `CustomerDetail` route on `GET /customers/:id` (profile + cursor-paginated history, 20/page, rows push the Epic 1 JobDetail), and migrating `CustomersScreen` onto the existing `useCustomers` store with focus refetch and pull-to-refresh, deleting its private duplicate fetch.

**Dependencies.** Story 2.1's history rows navigate into JobDetail (Story 1.2); everything else independent — this epic can run in parallel with Epic 1 up to that link.

**Definition of done.** Tapping any customer anywhere lands on a live detail screen; the codebase has one fetch path for the customer list; AddCustomerSheet's optimistic upsert still works.

**Stories:** 2.1 Customer Detail with job history · 2.2 One data path for the customer list.

---

## Epic 3: Technician Job Execution

**Goal.** UJ-2 works online: a technician sees real assigned jobs and executes the full 6-step workflow with photos and a customer signature, and the owner sees every step land in the activity log.

**Scope.** Technician navigation restructure (stack around tabs), Today/History wired to `GET /jobs` (server scopes technician role to own jobs), technician-layout JobDetail (tap-to-call, tap-to-map, owner notes, workflow stepper as the primary block), `POST /jobs/:id/workflow` with per-action idempotency keys and 422 `currentStep` reconciliation, two-phase R2 photo upload (presign → PUT → confirm, max 5, client-side type/size validation), and signature pad → PNG → same upload flow with `signature_captured` gating.

**Out of scope.** Offline behaviour (Epic 4) — but Story 3.1's job store is built behind a `useTechnicianJobs` interface explicitly so Epic 4 can swap its hydration source to `POST /sync` without touching screens, and Story 3.3 generates idempotency keys per action from day one so Epic 4's replay reuses them.

**Dependencies.** Epic 1's `ApiJob` type/formatters (1.1) and detail patterns (1.2). New libraries: `react-native-image-picker`, `react-native-signature-canvas` + `react-native-webview` (see Review Note 8).

**Sequencing.** 3.1 → 3.2 → 3.3 strictly; 3.4 and 3.5 after 3.3 (they interact with the step machine), 3.4 before 3.5 (3.5 reuses 3.4's upload pipeline).

**Definition of done.** SM-1 passes: job created on an owner device is completed on a technician device with 2 photos + signature, full activity log visible to the owner; `technicianApp/data.ts` deleted.

**Stories:** 3.1 Today & History wired · 3.2 Technician Job Detail · 3.3 Workflow step advancement · 3.4 Photo capture & upload · 3.5 Signature capture.

---

## Epic 4: Offline-First Sync

**Goal.** UJ-3 works: the entire Epic 3 flow survives airplane mode. Actions queue locally, replay exactly once on reconnect, conflicts reconcile silently to server state, and the technician always knows their sync status. This is BE PRD counter-metric SM-C2's other half — an FSM technician app that fails offline gets abandoned in the field.

**Scope.** MMKV-persisted job store hydrated by `POST /sync` (null cursor initial sync, `serverTime` as next cursor, swap behind the Story 3.1 interface), an MMKV FIFO-per-job action queue for workflow steps and attachment confirms (pre-generated idempotency keys, optimistic UI with pending markers, ordered replay with backoff, 422 `currentStep` drop-and-reconcile, queue survives app restart), and connectivity UX (NetInfo banner, pending badges, last-synced line, sane offline pull-to-refresh).

**Key rules.** A stale 15-min presigned PUT URL is never retried — photo actions whose PUT hasn't succeeded re-run from presign (Review Note 9). Sync triggers: app foreground, reconnect, post-queue-drain, manual.

**Dependencies.** Epic 3 complete. New library: `@react-native-community/netinfo`.

**Definition of done.** SM-2 passes: 3 steps advanced in airplane mode sync exactly once on reconnect (activity log shows no duplicates, no gaps); app kill mid-queue loses nothing.

**Stories:** 4.1 Delta sync hydration store · 4.2 Offline action queue with idempotent replay · 4.3 Connectivity UX.

---

## Epic 5: Account, Session & Polish

**Goal.** The account surface is complete and week-old sessions die gracefully. SM-4 passes: an expired JWT lands on login with a clear message, never a crash or hang.

**Scope.** Skills management screen from More (`GET/POST/DELETE /skills`, delete confirm warns about technician cascade), display-name edit for both roles (`PATCH /users/me` updating the shared profile store), wiring `setOnUnauthorized` (token clear already exists — add store resets, nav reset to AuthFlow, "Session expired" notice, technician queue retention per user), and error envelope polish (array `message` join in `ApiError`, audit Epics 1–4 screens for raw error codes leaking to UI).

**Dependencies.** 5.1/5.2 independent (can start anytime). 5.3 is best done early in real usage terms but is sequenced here because its store-reset list must include the stores Epics 1–4 create; if the team wants it earlier, implement with a reset registry that later stores join. 5.4 is a closing audit — last.

**Definition of done.** Skills manageable end-to-end and the invite picker reflects changes; both roles can fix their name and see it change on Home/Profile immediately; forced-401 test (tamper the stored token) lands on login with notice and a clean re-login works; no screen shows a raw `error_code`.

**Stories:** 5.1 Skills management screen · 5.2 Profile edit · 5.3 Session expiry & global 401 · 5.4 Error envelope consistency.
