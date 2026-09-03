# fenzit-be API Contracts — FE Reference (extracted from BE source 2026-09-01)

Authoritative request/response shapes for every endpoint the fenzo-app stories consume. Extracted directly from the BE source in this meta repo (`workspace/core/backend/fenzit-be/src/**`), NOT from docs — each section cites its source file. If BE code changes, re-verify against source.

## 0. Conventions

- **Base URL**: `apiClient` baseURL already includes `/api/v1` (`src/config/index.ts`). Resource paths in FE code are relative: `'/jobs'`, `'/sync'`. Never prefix `/api/v1` again.
- **Auth**: `Authorization: Bearer <jwt>` attached automatically by the apiClient request interceptor. JWT valid 7 days, no refresh endpoint.
- **Error envelope** (GlobalExceptionFilter): `{ statusCode: number, error_code: string, message: string | string[] }`. `message` is a **string array** for class-validator 422s (BE known quirk CR3) — FE must join. Some errors carry extra fields at the top level: workflow 422 adds `currentStep`.
- **ErrorCode enum** (src/common/enums/error-code.enum.ts): `UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, RESOURCE_NOT_FOUND, DUPLICATE_RESOURCE, RATE_LIMIT_EXCEEDED, INVALID_OTP, OTP_EXPIRED, OTP_SESSION_LOCKED, JOB_NOT_MODIFIABLE, INVALID_WORKFLOW_STEP, INTERNAL_SERVER_ERROR`. Plus one literal outside the enum: `UPLOAD_EXPIRED` (HTTP 410, attachments confirm).
- **Pagination envelope** (src/common/dto/paginated-response.dto.ts): `{ data: T[], nextCursor: string | null, hasMore: boolean }` — `hasMore === (nextCursor !== null)`. Matches FE `Paginated<T>` in `services/api/pagination.ts` exactly. Cursor is opaque base64; pass back verbatim as `?cursor=`; max length 512; malformed cursor → 400.
- **"Company not set up"**: every jobs/customers/skills call by a user with null tenantId → **400** `VALIDATION_ERROR` (not 422). FE should never hit this post-onboarding, but handle as generic error.
- **404 vs 403 semantics**: cross-tenant or missing resource is always **404 RESOURCE_NOT_FOUND**; 403 FORBIDDEN is role/ownership only (technician touching a job not assigned to them).

## 1. Shared enums (string values are the wire format)

```ts
type JobStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
type ServiceType = 'ac_service' | 'ac_installation' | 'pest_control' | 'plumbing' | 'electrical' | 'other';
type JobPriority = 'normal' | 'urgent';
type WorkflowStep = 'on_my_way' | 'arrived' | 'in_progress' | 'photos_uploaded' | 'signature_captured' | 'completed';
type AttachmentType = 'photo' | 'signature';
```
Step order is fixed: `on_my_way → arrived → in_progress → photos_uploaded → signature_captured → completed`. Fresh job has `currentStep: null`. `photos_uploaded` skippable only when `requireCompletionPhoto === false` (then `in_progress → signature_captured` is legal).

## 2. JobResponse (list rows, create/patch/workflow responses)

Source: src/jobs/jobs.service.ts `JobResponse` (L31–49).
```ts
interface ApiJob {
  id: string;                       // uuid
  jobNumber: string;                // "JB-2026-0042"
  tenantId: string;
  customerId: string;
  technicianId: string;
  serviceLocation: string;
  serviceType: ServiceType;
  scheduledStart: string;           // ISO 8601 UTC
  scheduledEnd: string | null;
  status: JobStatus;
  currentStep: string | null;       // one of WorkflowStep, or null pre-start
  priority: JobPriority;
  requireCompletionPhoto: boolean;
  description: string | null;
  notesForTechnician: string | null;
  createdAt: string;
  updatedAt: string;
}
```
Note: NO customer name, NO technician name, NO amount on list rows. List UI needing the customer's name must join client-side (see Story 1.1 Dev Notes) or come from detail/sync payloads which embed it.

## 3. GET /jobs — list (Owner + Technician)

Source: list-jobs-query.dto.ts, jobs.service.ts#listJobs.
- Query params: `date?` (YYYY-MM-DD, must be a REAL calendar date — 2026-02-30 → 422; omitted = today IST), `status?` repeatable (`?status=scheduled&status=in_progress`; axios: `params: { status: ['scheduled','in_progress'] }` — axios serializes repeats by default `status[]=`, which Fastify/qs also accepts; verify once and if bracket style fails, use `paramsSerializer`), `technicianId?` (uuid; owner-only filter, silently ignored for technician role), `cursor?`, `limit?` (1–50, default 50).
- Filter window: `scheduledStart` within the IST day. Sort: `createdAt DESC, id DESC` (NOT by scheduledStart).
- Technician role: server forces `technician_id = caller`; returns only own jobs.
- 200 → `Paginated<ApiJob>`; empty match → `{ data: [], nextCursor: null, hasMore: false }`.
- Errors: 400 bad cursor/company; 401; 422 invalid date/status/limit.

## 4. GET /jobs/:id — detail (Owner + assigned Technician)

Source: jobs.service.ts `JobDetailResponse` (L93–98) + assemble logic.
```ts
interface JobDetail extends ApiJob {
  technician: { id: string; name: string; countryCode: string; phoneNumber: string; skills: string[] };
  customer:   { id: string; name: string; countryCode: string; phoneNumber: string; address: string | null; city: string | null };
  activityLog: ActivityLogEntry[];   // ordered oldest-first
  attachments: JobAttachment[];      // ordered oldest-first
}
interface ActivityLogEntry { id: string; eventType: string; actorId: string; metadata: Record<string, unknown> | null; createdAt: string }
interface JobAttachment    { id: string; type: 'photo' | 'signature'; url: string | null; createdAt: string }
```
- `attachments[].url` is a presigned R2 read URL, **1-hour TTL, regenerated every call, may be null** on a transient signing failure (refetch to retry that URL). NEVER persist it.
- `activityLog[].eventType` values: `job_created, job_reassigned, job_cancelled, step_on_my_way, step_arrived, step_in_progress, step_photos_uploaded, step_signature_captured, step_completed, conflict_resolved`. `job_reassigned` metadata carries previous/new technicianId.
- Errors: 404 (missing/cross-tenant); 403 (technician not assigned); 400 malformed uuid (ParseUUIDPipe) or company.

## 5. POST /jobs — create (Owner) [already wired]

Body (create-job.dto): `customerId` XOR `newCustomer{name,countryCode,phoneNumber,address?,city?}`, `serviceLocation`, `serviceType`, `scheduledStart` (ISO), `technicianId`; optional `scheduledEnd`, `description`, `priority`, `requireCompletionPhoto`, `notesForTechnician`. `scheduledEnd < scheduledStart` → 422. 201 → full `ApiJob`. FE `CreatedJob {id}` should be widened to `ApiJob` in Story 1.1.

## 6. PATCH /jobs/:id — edit/reassign/cancel (Owner)

Source: jobs.service.ts#updateJob (L324–481).
- Body: any subset of `{ description, scheduledStart, scheduledEnd, notesForTechnician, technicianId, priority }` OR exactly `{ status: 'cancelled' }`.
- **Rules enforced server-side (mirror in FE):**
  - Cancel + any edit field in one request → 422 "Cancellation cannot be combined with field edits". Send cancel ALONE.
  - Empty patch (no fields) → 422 "No updatable fields provided". Diff before sending.
  - Both dates present and end < start → 422. One-sided edit that inverts the STORED window → 422 (server PT422) — FE should pre-check against the loaded job's other bound.
  - Cannot clear a field to null: `null`/absent both mean "leave unchanged" (COALESCE, BE deferred E1). Do not build clear-field UX.
- 200 → `ApiJob`. Errors: 409 `JOB_NOT_MODIFIABLE` (not `scheduled`); 404 job or technician; 422; 403 technician JWT.

## 7. POST /jobs/:id/workflow — advance step (assigned Technician)

Source: workflow.service.ts.
- Body: `{ step: WorkflowStep }`. Optional header `X-Idempotency-Key: <uuid v4>` (24h replay window; replay returns original body without re-applying).
- Status transitions: `on_my_way` → job status `in_progress`; `completed` → `completed`; others leave status unchanged.
- **Same-step no-op**: posting the job's exact `currentStep` again returns 200 with current `ApiJob`, no new log entry (works even without idempotency key).
- 200 → `ApiJob` (post-advance).
- 422 `INVALID_WORKFLOW_STEP` → body: `{ statusCode: 422, error_code: 'INVALID_WORKFLOW_STEP', message: 'Invalid workflow step transition', currentStep: string | null }` ← **`currentStep` at top level of the error body**; FE reads it from `ApiError.details`.
- 409 `JOB_NOT_MODIFIABLE` → terminal status OR lost concurrent race (indistinguishable, BE CR1) → always refetch-and-reconcile.
- 404 (missing/cross-tenant), 403 (owner JWT or not assigned), 400 (uuid/company).

## 8. POST /jobs/:id/attachments — request presigned upload (assigned Technician)

Source: attachments.service.ts#requestUpload.
- Body: `{ filename: string, mimeType: 'image/jpeg' | 'image/png' | 'image/heic', attachmentType: 'photo' | 'signature' }`. Optional `X-Idempotency-Key`.
- 200 → `{ presignedPutUrl: string, uploadId: string, key: string, expiresAt: string }` — URL TTL **900s (15 min)**.
- 409 `DUPLICATE_RESOURCE` "Maximum of 5 photos already uploaded" (photo type only; counted on CONFIRMED photos).
- 422 bad mimeType/missing fields; 404 job; 403 not assigned.
- ⚠️ BE CR3.6-1: an idempotency replay past 15 min returns the ORIGINAL (now dead) URL with 200. Therefore: FE uses a FRESH idempotency key per presign attempt, and NEVER retries a stale presigned URL — re-presign instead.

## 9. PUT <presignedPutUrl> — raw upload to R2 (no auth)

- Plain `fetch(presignedPutUrl, { method: 'PUT', headers: { 'Content-Type': <same mimeType as presign> }, body: <blob> })`. NOT through apiClient (must not carry the Bearer header; different host). Non-2xx = failure → restart from presign.
- Blob from a local file uri in RN: `const blob = await (await fetch(fileUri)).blob()`.

## 10. POST /jobs/:id/attachments/:uploadId/confirm — finalize (assigned Technician)

Source: attachments.service.ts#confirmUpload.
- Body: `{ sizeBytes: number }` (int ≥ 1; > 50 MB default cap → 400 VALIDATION_ERROR).
- 200 → `{ id: string, type: 'photo' | 'signature', createdAt: string }`.
- 404 `RESOURCE_NOT_FOUND` "Upload not found" (unknown/stale uploadId); **410** `UPLOAD_EXPIRED` "Upload session expired — request a new presigned URL"; 409 `DUPLICATE_RESOURCE` photo limit hit at confirm time.
- Side effect: first PHOTO confirm on a job auto-advances `photos_uploaded` (activity log `step_photos_uploaded`, actor null). Signature confirm when one exists REPLACES it (last write wins) and logs `conflict_resolved`.
- ⚠️ Never store uploadIds across sessions (BE CR3.6-4: a replaced signature's old uploadId re-confirm 404s).

## 11. POST /sync — delta sync (Technician only)

Source: sync-request.dto.ts, sync.service.ts.
- Body: `{ lastSyncedAt?: string }` — ISO 8601 **strict**; OMIT the field for initial sync (do not send null — `@IsISO8601` on a null may 422; omit is the documented shape). 422 on invalid format. Owner JWT → 403.
- 200 →
```ts
interface SyncResponse { jobs: SyncJob[]; serverTime: string }
interface SyncJob extends ApiJob {
  customer: { name: string; address: string | null };
  attachments: { id: string; attachmentType: 'photo' | 'signature'; sizeBytes: number; createdAt: string }[];  // metadata only — NO urls
}
```
- Semantics: rows with `updated_at > lastSyncedAt` (strictly greater — an equal-timestamp row is skipped by design, CR4.1-D1), newest first, LIMIT 500, scoped to caller's own jobs. `serverTime` captured BEFORE the query — store it as the next cursor.

## 12. GET /customers — list (Owner) [already wired]

Row (`CustomerListItem`): `{ id, name, countryCode, phoneNumber, address, city, jobCount: number, lastJobDate: string | null }` in `Paginated<>`. Query: `q?` (partial, case-insensitive, name + phone — EXISTS server-side even though FE currently filters client-side), `cursor?`. FE `ApiCustomer` type matches.

## 13. GET /customers/:id — detail (Owner)

Source: customers.service.ts `CustomerDetailResponse` (L63–72).
```ts
interface CustomerDetail extends ApiCustomerProfile {
  // id, name, countryCode, phoneNumber, address, city, createdVia, createdAt, tenantId
  jobHistory: Paginated<JobHistoryItem>;
}
interface JobHistoryItem { jobNumber: string; scheduledStart: string; status: string; serviceType: string }
```
- ⚠️ **BE GAP (open)**: as of 2026-09-01 the service returns `jobHistory: { data: [], nextCursor: null, hasMore: false }` ALWAYS — the Epic-2 placeholder was never wired after jobs landed. BE Story **2.4** (`fenzit-be/_bmad-output/implementation-artifacts/2-4-customer-detail-job-history.md`) fixes it: real query, `scheduled_start DESC`, page size 20, `?cursor=` query param on this endpoint, and adds `id: string` to `JobHistoryItem` so rows can navigate to job detail. **FE Story 2.1 is blocked on BE 2.4 for real data** but can be built against the envelope (shape is final).
- 404 cross-tenant/missing; 403 technician.

## 14. GET /users/me + PATCH /users/me (Owner + Technician)

- GET: bootstrap payload — see FE `MyProfile` in `services/resources/users.ts` (already accurate): user fields + `tenant` + `technicians[]` (server ids + parallel `skills`/`skillIds`) + `technicianCount` + `customers: Paginated` + `jobs: Paginated` + `jobStatusCounts { scheduled, inProgress, completed, cancelled }`. Technician role gets own-scoped variant.
- PATCH: body `{ name: string }` (trimmed, 1–100 chars → else 422). 200 → the SAME full profile payload as GET. Both roles allowed.

## 15. Skills (Owner)

Source: skills.service.ts.
- `GET /skills` → **plain array** `SkillResponse[]` `{ id, name, tenantId, createdAt }` (NOT paginated envelope).
- `POST /skills` body `{ name }` (server: trim, unique per tenant case-insensitive, ≤100) → 201 `SkillResponse`; 409 `DUPLICATE_RESOURCE` "A skill with this name already exists for your company".
- `DELETE /skills/:id` → 200 `{ success: true }`; 404 `RESOURCE_NOT_FOUND`; cascades to `user_skills` (technicians lose the skill).

## 16. Auth (already wired — for completeness)

- `POST /auth/otp/send` `{ countryCode, phoneNumber }`-shaped per FE authApi → `{ otp_session_id, expires_at, otp? }` (mock echoes an `otp` in dev).
- `POST /auth/otp/verify` `{ otpSessionId, otpCode }` → `{ token, user: { userId, tenantId | null, role, name | null } }`.
- `POST /auth/company` → `{ token, tenant }` (fresh token with tenantId claim — FE already stores it).
- `POST /auth/invite` `{ name, countryCode, phoneNumber, skillIds[] (≤20) }` → `{ invite_id }`.
