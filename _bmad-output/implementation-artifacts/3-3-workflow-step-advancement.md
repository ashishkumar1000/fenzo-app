# Story 3.3: Workflow Step Advancement

Status: ready-for-dev

## Story

As a technician,
I want one-tap progress reporting through the fixed six-step order,
so that the owner sees my real-time progress and nothing needs typing in the field.

## API Contract (api-contracts.md §7 — read fully)

`POST /jobs/:id/workflow` body `{ step }`, optional header `X-Idempotency-Key` (uuid v4, 24h dedup). 200 → full `ApiJob`. Transitions: on_my_way → status in_progress; completed → status completed. Same-step repost → 200 current state (no new log). 422 `INVALID_WORKFLOW_STEP` body carries top-level `currentStep` (read via `ApiError.details`). 409 `JOB_NOT_MODIFIABLE` = terminal OR lost race → ALWAYS refetch-and-reconcile. 403/404 as usual.

## UI Design (ui-design-spec.md §9 — bottom action bar)

ONE bottom action bar, absolutely positioned: surfaceCard bg, top hairline borderSubtle, upward shadow.md, padding s4 + safe-area bottom. Content = single Button primary lg fullWidth labeled by the next step ("On my way" / "Arrived" / "Start work" / "Capture signature" / "Mark complete"), loading while posting. Photo-required state (requireCompletionPhoto && in_progress): the bar shows a NON-tappable info pill instead — Camera 18 progress.fg + bodySm "Upload a photo to continue" on progress.bg, radius.md, padding s3 (the Photos card above carries the action). Completed: bar content = CheckCircle2 20 done.solid + bodyStrong done.fg "Job completed" (static, no animation). Terminal/cancelled: no bar. Errors surface as an InlineError line above the bar; 422 reconciliation is SILENT (stepper just re-renders correct state).

## Acceptance Criteria

1. **Given** a non-terminal job on TechJobDetail, **then** exactly one primary Button renders at the bottom (safe-area padded, full width), labeled by the 'next' step from `buildStepper`: on_my_way→"On my way", arrived→"Arrived", in_progress→"Start work", photos_uploaded→(NEVER a button — see AC 3), signature_captured→"Capture signature", completed→"Mark complete".
2. **Given** a tap, **then** the button enters loading (Button's loading prop; double-tap impossible), the request fires with a FRESH `generateIdempotencyKey()` header, and on 200: local detail merges the returned `ApiJob`, `upsertJob(response)` updates the technician store, the stepper re-derives, and if step was `completed` a subtle success state shows (tick + "Job completed" line, no confetti/emoji) and the primary button disappears.
3. **Given** `requireCompletionPhoto === true` and current step `in_progress`, **then** the primary action area shows a non-button hint card "Upload a photo to continue" (photos step auto-advances server-side on first photo confirm — Story 3.4); after the confirm lands (detail refetch), signature becomes the next action.
4. **Given** the next step is `signature_captured`, **then** the button navigates to `Signature { jobId }` (Story 3.5) instead of posting directly — INTERIM until 3.5 merges: post directly (dev path), switch to navigation in 3.5 (leave a `// TODO(3.5)` marker).
5. **Given** a 422 `INVALID_WORKFLOW_STEP`, **then** NO error UI: read `currentStep` from `ApiError.details`, patch it into local detail + store, re-derive the stepper (silent reconcile).
6. **Given** a 409, **then** toast/inline "This job can no longer be updated" + full detail refetch. **Given** a network-class error (`status === 0`), **then** this story shows the error inline with retry (Epic 4 replaces this branch with enqueue — leave a `// EPIC4: enqueue here` marker at the exact catch site).

## Tasks / Subtasks

- [ ] **Task 1 — Idempotency util** (`src/utils/idempotency.ts`, new):
  ```ts
  export function generateIdempotencyKey(): string {
    const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } };
    if (g.crypto?.randomUUID) return g.crypto.randomUUID();
    const bytes = g.crypto?.getRandomValues ? g.crypto.getRandomValues(new Uint8Array(16)) : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const h = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
    return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10).join('')}`;
  }
  ```
  (Hermes on RN 0.86 has `crypto.getRandomValues`; `randomUUID` availability varies — the ladder covers all cases with zero dependencies. Verify at runtime and note which branch fires in Dev Agent Record.)
- [ ] **Task 2 — ApiError details typing**: confirm `apiError.ts` already sets `details: data` (it does, L102) — add an exported helper `export function workflowCurrentStep(e: ApiError): string | null | undefined { const d = e.details as { currentStep?: string | null } | undefined; return e.code === 'INVALID_WORKFLOW_STEP' ? d?.currentStep : undefined; }` in `services/api/apiError.ts`.
- [ ] **Task 3 — Service** (`services/resources/jobs.ts`):
  ```ts
  async function advanceWorkflow(id: string, step: WorkflowStepApi, idempotencyKey: string): Promise<ApiJob> {
    const res = await apiClient.post<ApiJob>(`/jobs/${id}/workflow`, { step }, { headers: { 'X-Idempotency-Key': idempotencyKey } });
    return res.data;
  }
  ```
- [ ] **Task 4 — Stepper interactivity** (`WorkflowStepper.tsx`): honour `onAdvance`/`pendingStep` props (3.2 stubbed them) — the 'next' row gets a subtle pressed state while pending; the PRIMARY action button itself lives on the screen (bottom bar), not inside the stepper rows (44px+ target, thumb reach).
- [ ] **Task 5 — Screen orchestration** (`TechJobDetailScreen`):
  ```ts
  const [pendingStep, setPendingStep] = useState<string | null>(null);
  const advance = async (step: WorkflowStepApi) => {
    setPendingStep(step);
    try {
      const job = await jobService.advanceWorkflow(jobId, step, generateIdempotencyKey());
      setDetail(d => d ? { ...d, ...job } : d); upsertJob(job);
      // append an optimistic log entry locally? NO — refetch lazily; timestamps come from next refetch
    } catch (e) {
      const err = e as ApiError;
      const cur = workflowCurrentStep(err);
      if (cur !== undefined) { setDetail(d => d ? { ...d, currentStep: cur } : d); /* + upsertJob patched */ return; }
      if (err.code === 'JOB_NOT_MODIFIABLE') { showInline('This job can no longer be updated'); await refetch(); return; }
      if (err.status === 0) { /* EPIC4: enqueue here */ showInline(err.message); return; }
      showInline(err.message);
    } finally { setPendingStep(null); }
  };
  ```
  Button label map + AC 3 hint card + AC 4 signature branch.
- [ ] **Task 6 — Tests**: label map per next step incl. photo-hint and signature branches; 422 reconcile patches currentStep and shows no error; 409 triggers refetch; idempotency header present (assert on mocked axios call); generateIdempotencyKey shape (regex v4) and uniqueness over 1000 calls.

## Dev Notes

- Keys are generated AT ACTION CREATION and passed in — never inside the service function — because Epic 4 replays the SAME key for a queued action. The service signature therefore requires the key.
- Never trust local state after any 4xx: 422 → reconcile from body; 409 → refetch; both silent-or-gentle, never raw codes.
- `completed` moves the job out of Today's active sections on next `loadToday` — do not hand-remove from the array (upsert keeps it; sections re-derive).
- Files: NEW `src/utils/idempotency.ts`; MODIFY `services/api/apiError.ts`, `services/resources/jobs.ts` + barrel, `features/technicianApp/components/WorkflowStepper.tsx`, `features/technicianApp/TechJobDetailScreen.tsx`; tests.
- [Source: api-contracts.md §7; fenzit-be workflow.service.ts (same-step no-op L156–172, 422 body L184–192, PT409 L219–227); deferred-work CR1].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
