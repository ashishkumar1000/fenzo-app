---
title: Fenzit Mobile App – Frontend Completion (Phase 1 MVP — API Wiring & Technician Execution)
status: draft
created: 2026-09-01
updated: 2026-09-01
---

# PRD: Fenzit Mobile App — Frontend Completion (Phase 1 MVP)

## 0. Document Purpose

This PRD defines the remaining frontend work for the Fenzit React Native app (`fenzo-app`), consuming the fully implemented `fenzit-be` REST API. The backend (all 4 epics: Foundation & Auth, Customers, Job Lifecycle, Offline Sync) is complete. The frontend has auth, onboarding, customer create/list, technician invite, and job creation wired; everything else — the owner's live job board, job detail, job editing, customer detail, and the entire technician execution flow (workflow steps, photos, signature, offline sync) — is missing or running on local mock data.

Source of truth for API contracts: `fenzit-be/_bmad-output/planning-artifacts/prds/prd-fenzo-be-2026-06-17/prd.md` (FR-1 to FR-18) and the live Swagger at `/api/docs`. Downstream consumers: epics and stories in `epics.md`.

---

## 1. Vision

Complete the Phase 1 loop end-to-end on mobile: an owner creates a job and assigns it to a technician; the technician sees it on their phone, executes it through the 6-step workflow (including photos and signature), even without connectivity; the owner watches status change live. Today the owner can create the job but nobody can see it or execute it. This increment closes that gap.

---

## 2. Current State (Gap Analysis)

### 2.1 Wired and working (do not rebuild)

| Area | FE code | BE endpoint |
|---|---|---|
| OTP login | `features/auth`, `services/resources/authApi.ts` | POST /auth/otp/send, /auth/otp/verify |
| Company setup | `AuthFlow` → `authApi.setupCompany` | POST /auth/company |
| Technician invite + skill picker | `features/technicians`, `skillService` | POST /auth/invite, POST/GET /skills |
| Bootstrap profile | `features/profile/useMyProfile` | GET /users/me |
| Customer create + list | `features/customers`, `customerService` | POST /customers, GET /customers |
| Job create | `features/newJob/NewJobScreen`, `jobService.create` | POST /jobs |
| Role-based routing | `App.tsx` → RootNavigator (owner) / TechnicianTabs (technician) | — |

### 2.2 Missing (this PRD's scope)

**Owner side:**
- `JobsScreen` renders local mock `JOBS` from `data.ts`; `useJobs` is an MMKV store with a `TODO(api)` — GET /jobs is never called.
- No Job Detail screen at all — GET /jobs/:id unused. No activity log, no attachments view, no current step.
- No edit / reassign / cancel UI — PATCH /jobs/:id unused.
- No Customer Detail screen — GET /customers/:id unused.
- `CustomersScreen` fetches independently into component state while `useCustomers` store exists — two data paths to one endpoint (known follow-up noted in `useCustomers.ts`).
- No skills management screen — DELETE /skills/:id unused outside code.
- Home stat tiles come from the one-shot /users/me payload; no refresh on focus.

**Technician side (almost entirely missing):**
- `TodayScreen` / `HistoryScreen` render empty static arrays (`TODAY_JOBS`, `JOB_HISTORY` in `technicianApp/data.ts`).
- No technician job detail, no workflow step advancement (POST /jobs/:id/workflow unused).
- No photo capture/upload (POST /jobs/:id/attachments + confirm unused), no signature capture.
- No offline layer: POST /sync unused, no action queue, no idempotency keys, no conflict reconciliation.

**Cross-cutting:**
- No 401/session-expiry handling (JWT is 7-day, no refresh endpoint — expired token must route to re-login).
- No profile edit — PATCH /users/me unused.
- Known API vocabulary mismatch: tenant `serviceCategories` vs job `serviceType` enum is lossy (4 of 9 categories collapse to `other`, `ac_installation` unreachable) — documented in `services/resources/jobs.ts`; raise with backend, not fixable in FE.

---

## 3. Target User Journeys (must work after this increment)

**UJ-1. Owner sees the live job board.** Ravi opens Jobs tab → sees today's real jobs from GET /jobs, filterable by status → taps one → full detail with activity log and attachments → edits time or reassigns technician on a scheduled job → cancels a job with confirmation.

**UJ-2. Technician executes a job end-to-end.** Suresh logs in → Today tab shows his assigned jobs from the API → taps a job → advances On my way → Arrived → In progress with one tap each → takes 2 photos (uploaded via presigned R2 PUT + confirm) → captures customer signature → Mark complete. Every step reflects on Ravi's job detail.

**UJ-3. Technician works offline.** Suresh loses connectivity in a basement → steps queue locally with idempotency keys → app shows offline banner and pending count → on reconnect, queue replays in order, POST /sync pulls the delta, conflicts (422 with `currentStep`) reconcile silently to server state — no step lost, no duplicate.

**UJ-4. Owner reviews a customer.** Ravi opens a customer → profile plus paginated job history from GET /customers/:id.

---

## 4. Functional Requirements

### 4.1 Owner — Live Job Board

- **FE-FR-1: Jobs list wired to GET /jobs.** Replace `JOBS` mock and MMKV `useJobs` with a shared API-backed store (same `useSyncExternalStore` pattern as `useMyProfile`). Support `status` filter chips mapping to `?status=` params, date defaulting to today (server does IST), cursor pagination (infinite scroll), pull-to-refresh, refetch on screen focus. Empty array renders existing empty states.
- **FE-FR-2: Job Detail screen (owner).** GET /jobs/:id → job fields, customer profile, technician profile, current workflow step, activity log timeline (oldest-first), attachment thumbnails (presigned URLs are 1-hour TTL and regenerated per call — never cache them across sessions). Entry points: JobCard tap on Jobs tab and Home.
- **FE-FR-3: Edit / reassign / cancel.** On a `scheduled` job only: edit description, scheduledStart/End, notes, priority; reassign technician (picker fed from /users/me roster ids); cancel with confirm dialog. PATCH /jobs/:id; 409 `JOB_NOT_MODIFIABLE` surfaces as a friendly "job already started" message and refreshes detail.
- **FE-FR-4: Home stats refresh.** Refetch /users/me (or the future jobs counts) on Home focus and after job mutations so stat tiles are not one-shot stale.

### 4.2 Owner — Customers & Settings

- **FE-FR-5: Customer Detail screen.** GET /customers/:id → profile + job history list (cursor-paginated, page size 20), each row tappable into Job Detail.
- **FE-FR-6: Single customer data path.** Migrate `CustomersScreen` onto the `useCustomers` store; add focus refetch and pull-to-refresh; delete the duplicate component-state fetch.
- **FE-FR-7: Skills management.** More tab → Skills screen: list (GET /skills), add (POST /skills), delete with confirm (DELETE /skills/:id — cascades to technicians, warn in the dialog).
- **FE-FR-8: Profile edit.** Edit own display name via PATCH /users/me from More (owner) and Profile (technician).

### 4.3 Technician — Job Execution

- **FE-FR-9: Today & History wired.** GET /jobs for the technician role (server scopes to own jobs). Today = today's jobs grouped by status; History = completed/cancelled (status filters). Replace `TODAY_JOBS`/`JOB_HISTORY` static arrays.
- **FE-FR-10: Technician Job Detail.** Same GET /jobs/:id data, technician layout: customer name/phone/address (tap-to-call, tap-to-map), notes from owner, and the workflow stepper as the primary element.
- **FE-FR-11: Workflow advancement.** One-tap step buttons in strict order: on_my_way → arrived → in_progress → photos_uploaded → signature_captured → completed. POST /jobs/:id/workflow with an `X-Idempotency-Key` UUID per action. `photos_uploaded` auto-advances via first photo confirm (server behaviour) and is skippable when `requireCompletionPhoto` is false. 422 responses carry `currentStep` — reconcile UI to it, never show a raw error.
- **FE-FR-12: Photo capture & upload.** Camera/gallery → request presigned URL (POST /jobs/:id/attachments, type photo, max 5, JPEG/PNG/HEIC ≤ 10 MB) → PUT bytes direct to R2 → confirm (POST /jobs/:id/attachments/:uploadId/confirm). Parallel uploads allowed (one URL per file). Show per-photo progress and retry.
- **FE-FR-13: Signature capture.** Signature pad → PNG → same two-phase upload with type signature. Re-capture replaces the previous one (server: last write wins).

### 4.4 Offline-First (Technician)

- **FE-FR-14: Delta sync store.** MMKV-persisted job store hydrated by POST /sync. Store `serverTime` as the next `lastSyncedAt` cursor. Sync on app foreground, on reconnect, and after queue drain. Initial sync (`null` cursor) on first login.
- **FE-FR-15: Offline action queue.** Workflow steps and attachment confirms enqueue when offline (MMKV, FIFO per job) with pre-generated idempotency keys. Optimistic UI: step shows done locally, marked pending. On reconnect, replay in order; 200 (fresh or idempotent replay) dequeues; 422 reconciles to `currentStep` and drops the stale action.
- **FE-FR-16: Connectivity UX.** NetInfo-driven offline banner, per-job pending-sync badge, "last synced" line, manual sync pull.

### 4.5 Cross-Cutting

- **FE-FR-17: Session expiry.** Global 401 handling in `apiClient`: clear token, reset stores, route to AuthFlow with a "session expired, please log in again" notice. JWT is 7-day with no refresh — this WILL happen to real users.
- **FE-FR-18: Error contract.** Surface `error_code`/`message` from the standard error envelope through `ApiError` consistently; validation 422 `message` may be a string array (known BE quirk CR3) — join before display.

---

## 5. Non-Goals (this increment)

- Invoicing, payments, UPI — no BE support (deferred to BE Phase 2).
- Push notifications, GPS tracking, WhatsApp — BE Phase 2.
- Supabase Realtime live push on owner board — Phase 1 uses focus refetch + pull-to-refresh (BE PRD OQ-1 unresolved); polling only if trivially cheap.
- Owner web dashboard — separate project.
- Fixing the serviceCategories↔serviceType enum mismatch — backend change, tracked as a dependency note.

## 6. Dependencies & Assumptions

- All 18 BE FRs are deployed and stable (sprint-status: epics 1–4 stories all done).
- Technician list-jobs: GET /jobs with technician JWT returns own jobs (BE FR-7); Today/History use it, POST /sync is the offline hydration path — both are used, for different purposes.
- [ASSUMPTION] GET /jobs response job shape matches GET /jobs/:id minus the embedded profiles/log — confirm against Swagger before Story 1.1.
- [ASSUMPTION] `react-native-vision-camera` or `react-native-image-picker` for photos, `react-native-signature-canvas` or Skia for signature, `@react-native-community/netinfo` for connectivity — final picks at story level, must work with Bun + RN version in use.
- Design system rules in `src/theme/DESIGN_SYSTEM.md` and `CLAUDE.md` are binding: tokens only, `src/components/ui` composition, Badge vocabulary Done/In Progress/Scheduled/Cancelled, 44px+ touch targets, no emoji, sentence case.

## 7. Success Metrics

- **SM-1:** Owner creates a job on device A; technician on device B sees it, completes all 6 steps with 2 photos + signature; owner's job detail shows the full activity log. Zero manual data.
- **SM-2:** Airplane-mode test: technician advances 3 steps offline; on reconnect all 3 sync exactly once (verify via activity log — no duplicates, no gaps).
- **SM-3:** No screen in the app renders hardcoded/mock business data.
- **SM-4:** Expired-token flow lands on login with a clear message, not a crash or silent hang.
