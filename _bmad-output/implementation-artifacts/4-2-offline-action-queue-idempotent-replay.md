# Story 4.2: Offline Action Queue with Idempotent Replay

Status: ready-for-dev

## Story

As a technician reconnecting after working offline,
I want my queued taps to apply exactly once, in order,
so that no step is lost and nothing applies twice — even if the app was killed in between.

## Contract facts this story leans on (api-contracts.md §7, §8, §10)

Workflow replay with the SAME `X-Idempotency-Key` within 24h → original 200 body, no re-apply. Same-step repost even WITHOUT a key → 200 no-op. Out-of-order → 422 with `currentStep`. Terminal/race → 409. Confirm replay: same-key 200; stale uploadId → 404; expired staging → 410. Presigned URLs (15 min) are NEVER queued or retried — only post-PUT confirms queue.

## UI Design

No new visuals — this story PRODUCES the pending data that already-specced states consume: stepper amber "Waiting to sync" circles (spec §9), JobCard pending meta row (§1), photo tile amber strip (§10), signature offline gate (§11). Optimistic application must render those states immediately on enqueue; Story 4.3 wires the banner/badges. Never show success language for a queued action — "Waiting to sync" until the server confirms.

## Acceptance Criteria

1. **Given** a workflow-step or attachment-confirm attempt failing with a network-class `ApiError` (`status === 0`, code ∈ {NETWORK_ERROR, TIMEOUT}) OR NetInfo already reporting offline, **then** the action enqueues (MMKV, per-user) carrying its ALREADY-GENERATED idempotency key, and the UI applies optimistically: syncStore `applyLocalPatch(jobId, { currentStep: step, status: derivedStatus, pendingSync: true })` for steps; the photo/signature tile shows "Waiting to sync" for confirms.
2. **Given** connectivity returns (4.3's onReconnect) or app launch with a non-empty queue while online, **then** `drainQueue()` replays: per-job strict FIFO, one request at a time per job, different jobs in parallel (Promise.all over per-job chains); 200 → dequeue + clear pending; after a full drain, `runSync({ force: true })`.
3. **Given** a 422 `INVALID_WORKFLOW_STEP` during replay, **then** the action drops, `applyLocalPatch(jobId, { currentStep: serverCurrentStep, pendingSync: stillQueued > 0 })`, and any queued workflow actions for that job whose step index ≤ index(serverCurrentStep) drop too (they are already reflected server-side); NO user-facing error.
4. **Given** a 409 during replay, **then** the job's ENTIRE remaining queue drops and the post-drain sync reconciles — silent.
5. **Given** a network failure mid-replay, **then** remaining entries persist and the dispatcher retries with exponential backoff while online: delay = min(5s × 2^attempts, 120s), attempts persisted per entry.
6. **Given** app kill/relaunch, **then** the queue deserializes intact and pending markers re-render (pendingSync flags live in the sync store which also persisted).
7. **Given** a queued CONFIRM, **then** it exists ONLY for uploads whose PUT succeeded (the 3.4 hook's post-PUT boundary); a photo whose PUT never happened is NOT queued — its tile fails with Retry (fresh presign when online). A confirm replay answering 404 or 410 drops the entry and marks the tile failed-with-retry.
8. **Given** logout of the same user, **then** the queue PERSISTS (per-user key); a DIFFERENT user's login wipes it (4.1's user-change wipe covers `fenzit.queue.<oldUserId>`).

## Data model (exact)

```ts
// features/technicianApp/actionQueue.ts
export type QueuedAction =
  | { id: string; jobId: string; kind: 'workflow'; step: WorkflowStepApi; idempotencyKey: string; createdAt: number; attempts: number }
  | { id: string; jobId: string; kind: 'confirm';  uploadId: string; sizeBytes: number; attachmentType: 'photo' | 'signature'; idempotencyKey: string; createdAt: number; attempts: number };
// MMKV key: `fenzit.queue.<userId>` → JSON QueuedAction[] (append order IS replay order)
```

## Tasks / Subtasks

- [ ] **Task 1 — Queue module** (`features/technicianApp/actionQueue.ts`, new; pure, no React): `initQueue(userId)`, `enqueue(action: Omit<QueuedAction,'id'|'createdAt'|'attempts'>)` (id = generateIdempotencyKey reuse is fine), `all()`, `byJob(jobId)`, `dequeue(id)`, `dropJobActions(jobId, predicate?)`, `bumpAttempts(id)`, `size()`, `subscribe(cb)`; every mutation persists then notifies.
- [ ] **Task 2 — Dispatcher** (`features/technicianApp/queueDispatcher.ts`, new; pure):
  ```ts
  let draining = false;
  export async function drainQueue(): Promise<void> {
    if (draining) return; draining = true;
    try {
      const jobs = groupBy(all(), a => a.jobId);
      await Promise.all(Object.values(jobs).map(chain => replayChain(chain)));
      await runSync({ force: true });
    } finally { draining = false; }
  }
  async function replayChain(actions: QueuedAction[]): Promise<void> {
    for (const a of actions) {
      await backoffDelay(a.attempts);
      try {
        if (a.kind === 'workflow') await jobService.advanceWorkflow(a.jobId, a.step, a.idempotencyKey);
        else await attachmentService.confirmUpload(a.jobId, a.uploadId, a.sizeBytes, a.idempotencyKey);
        dequeue(a.id); clearPendingIfDrained(a.jobId);
      } catch (e) {
        const err = e as ApiError;
        const cur = workflowCurrentStep(err);
        if (cur !== undefined) { reconcileStep(a.jobId, cur); continue; }                    // AC 3 (dropStaleSteps inside)
        if (err.code === 'JOB_NOT_MODIFIABLE') { dropJobActions(a.jobId); return; }          // AC 4
        if (a.kind === 'confirm' && (err.status === 404 || err.status === 410)) { dequeue(a.id); markTileFailed(a); continue; }  // AC 7
        if (err.status === 0) { bumpAttempts(a.id); return; }                                // AC 5 — stop this chain, retry later
        // any other 4xx/5xx: bump attempts, stop chain (do not spin), surfaced by badge only
        bumpAttempts(a.id); return;
      }
    }
  }
  ```
  Wake sources: 4.3 onReconnect, app launch (bootstrap), post-enqueue-while-online-turned-out (a direct call raced offline). Backoff: in-memory timer per drain pass; attempts persisted.
- [ ] **Task 3 — executeOrEnqueue seam** (`features/technicianApp/executeOrEnqueue.ts`, new): replace 3.3's `// EPIC4: enqueue here` and 3.4's confirm network-fail path:
  ```ts
  export async function advanceStepResilient(jobId: string, step: WorkflowStepApi): Promise<'applied' | 'queued'> {
    const key = generateIdempotencyKey();
    if (!isOnline()) { queueStep(jobId, step, key); return 'queued'; }
    try { const job = await jobService.advanceWorkflow(jobId, step, key); applyServer(job); return 'applied'; }
    catch (e) { const err = e as ApiError; if (err.status === 0) { queueStep(jobId, step, key); return 'queued'; } throw e; }
  }
  function queueStep(jobId, step, key) { enqueue({ jobId, kind: 'workflow', step, idempotencyKey: key }); applyLocalPatch(jobId, { currentStep: step, status: step === 'on_my_way' ? 'in_progress' : step === 'completed' ? 'completed' : undefined, pendingSync: true }); }
  ```
  Same-shape `confirmResilient(...)` for confirms. 3.3's screen switches to `advanceStepResilient` (a 'queued' result renders the pending stepper state instead of the merged server job); 3.5's advance-after-signature also switches.
- [ ] **Task 4 — Stale-successor drop** (`reconcileStep`): `dropJobActions(jobId, a => a.kind === 'workflow' && STEP_ORDER.indexOf(a.step) <= STEP_ORDER.indexOf(serverCurrentStep))`; then `applyLocalPatch(jobId, { currentStep: serverCurrentStep, pendingSync: byJob(jobId).length > 0 })`.
- [ ] **Task 5 — Signature offline gate** (SignatureScreen): flip 3.5's interim to the real check — `useConnectivity().isOnline === false` → Save disabled + "Signature upload needs internet" (raw image bytes are never queued — recorded design decision).
- [ ] **Task 6 — Bootstrap**: `syncBootstrap.ts` (4.1) also `initQueue(userId)` and, when online at launch with `size() > 0`, `void drainQueue()`.
- [ ] **Task 7 — Tests** (the meat — pure modules make this easy): FIFO within a job; parallel jobs isolated; double drainQueue → single flight; 200 dequeues; 422 reconcile drops stale successors and keeps later ones; 409 drops whole job chain; network mid-chain stops chain, attempts bumped, later drain resumes; confirm 404/410 dequeues + failed-tile callback; serialize→kill→deserialize round-trip; per-user isolation; backoff formula (5s, 10s, 20s… cap 120s).

## Dev Notes

- "Offline" for enqueue = NetInfo says offline OR the request already failed with status 0. HTTP 4xx/5xx are ANSWERS — never enqueue those.
- The 24h idempotency window vs older queues: a >24h-old workflow replay re-processes, but the same-step no-op and compare-and-set make the outcome converge (409/422 handled above). Add a code comment; no special handling.
- pendingSync clearing: only when `byJob(jobId).length === 0` after a dequeue AND the post-drain sync ran — the sync's applyServerJobs overwrites the optimistic fields with server truth.
- Keep dispatcher/queue React-free; screens learn about pending state via syncStore + queue `subscribe`.
- Files: NEW `features/technicianApp/actionQueue.ts`, `queueDispatcher.ts`, `executeOrEnqueue.ts`; MODIFY `TechJobDetailScreen` (advanceStepResilient + pending stepper state), `SignatureScreen`, `useAttachmentUpload` (confirm path → confirmResilient + waiting-to-sync tile state), `syncBootstrap.ts`; tests.
- [Source: api-contracts.md §7, §8, §10; fenzit-be FR-17/FR-18 + stories 4-2/4-3; deferred W3, CR1, CR3.6-1; 3-3 key-at-creation contract; 4-1 applyLocalPatch/runSync].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
