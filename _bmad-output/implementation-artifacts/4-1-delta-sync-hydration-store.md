# Story 4.1: Delta Sync Hydration Store

Status: ready-for-dev

## Story

As a technician,
I want my job data persisted on-device and refreshed by delta sync,
so that my screens work instantly and without network.

## API Contract (api-contracts.md §11)

`POST /sync` body `{ lastSyncedAt?: string }` — ISO 8601 STRICT; **OMIT the field** for initial sync (never send null). Technician-only (owner → 403). 200 → `{ jobs: SyncJob[], serverTime: string }` where `SyncJob = ApiJob + { customer: { name, address }, attachments: { id, attachmentType, sizeBytes, createdAt }[] }` (metadata only, NO urls), newest-updated first, LIMIT 500, strictly `updated_at > lastSyncedAt`. `serverTime` (captured server-side BEFORE the query) is the next cursor.

## UI Design

No new visuals of its own — the offline detail fallback renders the EXISTING §8 layout from cache with these §10/§4 states: attachment tiles use the offline "Available online" tile, phone/skills rows hidden when absent from SyncJob. Once sync supplies `customer.name`, technician JobCards gain real names (spec §1 title rule). Everything else in this story is headless.

## Acceptance Criteria

1. **Given** first technician login (no persisted cursor for this userId), **then** `syncService.sync(undefined)` runs, all jobs persist to MMKV under the user's key, and `serverTime` persists as the cursor.
2. **Given** a persisted cursor, **then** subsequent syncs send it and MERGE returned jobs by id (update-or-insert; absent jobs untouched); the cursor advances to the NEW `serverTime` only on success.
3. **Given** AppState → 'active' or a manual/queue-drain trigger (`runSync()` exported), **then** an incremental sync runs — single-flight, min 10s between successful runs (force flag bypasses).
4. **Given** Epic 3 screens, **then** Today/History/TechJobDetail now read the sync store through the 3.1 seam: `setHydrators` re-points `hydrateToday`/`hydrateHistory` to selectors over persisted data (Today = local IST-day filter + non-history statuses; History = terminal statuses sorted `updatedAt` desc) and each hydrate call ALSO fires `runSync()` fire-and-forget; screens unchanged.
5. **Given** a sync failure, **then** persisted data still renders everywhere; `lastSyncSuccessAt` (persisted) is exposed for Story 4.3's "last synced" line and stays at the previous value.
6. **Given** logout of user A then login of user B, **then** B never sees A's data: all keys are namespaced `fenzit.sync.<field>.<userId>`; on auth-complete, compare stored `fenzit.sync.owner` userId — mismatch wipes A's sync + queue keys.
7. TechJobDetail offline behaviour: when the network fetch fails with `status === 0`, the screen falls back to the sync-store job (customer name/address from the SyncJob embed; attachments render metadata placeholders — no images offline); online behaviour (fresh GET /jobs/:id with URLs) unchanged.

## Tasks / Subtasks

- [ ] **Task 1 — Service** (`services/resources/sync.ts`, new):
  ```ts
  export interface SyncJobAttachment { id: string; attachmentType: 'photo' | 'signature'; sizeBytes: number; createdAt: string }
  export interface SyncJob extends ApiJob { customer: { name: string; address: string | null }; attachments: SyncJobAttachment[] }
  export interface SyncResponse { jobs: SyncJob[]; serverTime: string }
  async function sync(lastSyncedAt?: string): Promise<SyncResponse> {
    const body = lastSyncedAt ? { lastSyncedAt } : {};             // OMIT for initial — strict IsISO8601 would 422 a null
    const res = await apiClient.post<SyncResponse>('/sync', body);
    return res.data;
  }
  export const syncService = { sync };
  ```
- [ ] **Task 2 — IST day util** (`src/utils/istDay.ts`, new): mirror BE `getIstDayRange` — `const IST_OFFSET_MS = 5.5 * 3600_000; export function istDayRange(now = new Date()) { const shifted = new Date(now.getTime() + IST_OFFSET_MS); const dayStartUtcMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - IST_OFFSET_MS; return { start: new Date(dayStartUtcMs), end: new Date(dayStartUtcMs + 86_400_000) }; } export const isTodayIst = (iso: string, now?: Date) => { const { start, end } = istDayRange(now); const t = new Date(iso).getTime(); return t >= start.getTime() && t < end.getTime(); };`
- [ ] **Task 3 — Sync store** (`features/technicianApp/syncStore.ts`, new — pure module, no React): MMKV keys `fenzit.sync.jobs.<userId>` (JSON `Record<jobId, SyncJob>`), `fenzit.sync.cursor.<userId>`, `fenzit.sync.lastSuccess.<userId>`, plus `fenzit.sync.owner`. API:
  ```ts
  export function initSyncStore(userId: string): void            // wipe-on-user-change per AC 6, load into memory
  export function getJobs(): SyncJob[]
  export function getJob(id: string): SyncJob | undefined
  export function applyServerJobs(jobs: SyncJob[]): void          // merge by id, persist, notify subscribers
  export function applyLocalPatch(id: string, patch: Partial<SyncJob> & { pendingSync?: boolean }): void   // Epic 4.2 optimistic writes
  export function getMeta(): { lastSuccessAt: number | null }
  export function subscribe(cb: () => void): () => void
  export async function runSync(opts: { force?: boolean } = {}): Promise<void>  // single-flight + 10s throttle; sync(cursorOrUndefined) → applyServerJobs → persist new cursor + lastSuccess; role-guard: no-op unless current session role === 'technician'
  export function clearSyncStore(): void
  ```
  `pendingSync` is a LOCAL-only flag stored alongside a job (never sent) — define `type StoredJob = SyncJob & { pendingSync?: boolean }` and store that.
- [ ] **Task 4 — Seam swap** (`features/technicianApp/useTechnicianJobs.ts`): on module init (or App effect), call `setHydrators(todayFromStore, historyFromStore)` where:
  ```ts
  const todayFromStore = async () => { void runSync(); const data = getJobs().filter(j => isTodayIst(j.scheduledStart) || j.status === 'in_progress'); return { data, nextCursor: null, hasMore: false }; };
  const historyFromStore = async () => { void runSync(); const data = getJobs().filter(j => j.status === 'completed' || j.status === 'cancelled').sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)); return { data, nextCursor: null, hasMore: false }; };
  ```
  Also subscribe the technician store to `syncStore.subscribe` so an applyServerJobs re-renders screens (map SyncJob → the arrays). History pagination becomes local (sync returns the full ≤500 set) — remove the cursor UI path or leave it inert; record the decision.
- [ ] **Task 5 — Triggers** (`src/App.tsx` or a `features/technicianApp/syncBootstrap.ts` mounted for technician sessions): `AppState.addEventListener('change', s => s === 'active' && runSync())`; `initSyncStore(session.userId)` on technician session start — WAIT: `Session` (useAuth) holds role+tenantId only, no userId. Extend `Session` with `userId` (AuthFlow's verify result has it — `completeAuth({ role, tenantId, userId })`; update `useAuth` type + App.tsx callsite). Cleanup listener on unmount/role change.
- [ ] **Task 6 — Detail offline fallback** (`TechJobDetailScreen`): on fetch `status === 0`, `const cached = getJob(jobId)` → render a reduced detail (map SyncJob → the screen's needs: customer name/address from embed; skills/phone absent → hide those rows; attachments as placeholder tiles "Available when online"); banner state comes from 4.3.
- [ ] **Task 7 — Logout/user-change**: MoreScreen-equivalent technician logout calls `clearSyncStore()`; `initSyncStore` handles the user-mismatch wipe (also wipe `fenzit.queue.<oldUserId>` — coordinate key names with 4.2).
- [ ] **Task 8 — Tests** (pure store — no React): merge insert/update/no-delete; cursor = serverTime never device time; throttle + single-flight; user-change wipe; isTodayIst midnight boundaries (23:59 IST vs 00:01 IST as UTC instants: `2026-09-01T18:29:00Z` is today-IST for Sep 1? compute and assert both edges); today/history selectors.

## Dev Notes

- serverTime as cursor is non-negotiable (CR4.1-D1 strict-gt is by design; equal-timestamp misses are acceptable and self-heal on the row's next mutation).
- Do NOT store presigned URLs (sync never sends them anyway) — attachment metadata only.
- The sync store is technician-only; owner sessions must never call runSync (403 noise) — the role guard inside runSync is the single gate.
- Session.userId addition touches auth typing — keep it additive (optional field with a migration read: old persisted sessions lacking userId force a re-login by treating status as pending; simplest: bump `KEY` to `fenzit.session.v2`).
- Files: NEW `services/resources/sync.ts`, `src/utils/istDay.ts`, `features/technicianApp/syncStore.ts`, `features/technicianApp/syncBootstrap.ts`; MODIFY barrel, `useTechnicianJobs.ts`, `features/auth/useAuth.ts` (+ AuthFlow complete payload + App.tsx), `TechJobDetailScreen.tsx`, technician logout; tests.
- [Source: api-contracts.md §11; fenzit-be sync.service.ts + sync-request.dto.ts; fenzit-be common/utils/ist-day-range.util.ts (mirror); 3-1 setHydrators seam; deferred CR4.1-D1].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
