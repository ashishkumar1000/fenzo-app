# Story 5.4: Error Envelope Consistency

Status: ready-for-dev

## Story

As a user,
I want every error in the app to read as a plain sentence,
so that failures are understandable instead of alarming.

## Contract facts (api-contracts.md §0)

BE envelope `{ statusCode, error_code, message }` where 422 `message` is a **string[]** from class-validator (BE CR3, GlobalExceptionFilter). `toApiError` (services/api/apiError.ts) currently types `message?: string` and would render an array via implicit toString or pass it through — the join is NOT implemented (verified L92–103). Extra top-level fields (e.g. workflow `currentStep`) ride in `details` — already wired (L102).

## UI Design

No visual change — content consistency only. Error surfaces keep their existing components (InlineError / banner / EmptyState error variant); this story only guarantees what text flows into them.

## Acceptance Criteria

1. **Given** a 422 whose body message is `string[]`, **then** `toApiError` produces `message = arr.filter(Boolean).join('. ')` (single sentence chain); unit-tested with 0/1/3-element arrays; no screen can ever render "[object Object]" or a comma-mashed array. Stories 1.3/5.2's local `Array.isArray` shims are then DELETED (grep for them).
2. **Given** a network-class failure (`status === 0`), **then** every surface renders the shared copy from `errorCopy.NETWORK` ("Could not reach the server. Check your connection and try again.") — already toApiError's default; the constant becomes the single source both for toApiError and any screen-side copy.
3. **Given** a 5xx, **then** `errorCopy.SERVER` ("Something went wrong. Please try again.") — align `defaultMessageForStatus`.
4. **Given** an audit of `src/features/**`, **then** no UI copy string-interpolates `ApiError.code`, `ApiError.status`, `error_code`, or axios internals; every error surface renders `ApiError.message` (or more specific curated copy) through InlineError / banner / EmptyState error variants. Programmatic branching on `code`/`status` is FINE and stays.
5. A "Surfacing errors" section is added to `CLAUDE.md`: render `ApiError.message` via shared components; branch on `code` programmatically; never show codes/status numbers; specific copy beats generic when the screen knows better.

## Tasks / Subtasks

- [ ] **Task 1 — errorCopy** (`services/api/errorCopy.ts`, new): `export const errorCopy = { NETWORK: '…', TIMEOUT: 'The request took too long. Check your connection and try again.', SERVER: 'Something went wrong. Please try again.', CANCELLED: 'Request was cancelled.' } as const;` — refactor apiError.ts literals to import these.
- [ ] **Task 2 — Array join** (`services/api/apiError.ts`): change the payload typing to `{ error_code?: string; message?: string | string[] }` and normalize:
  ```ts
  const rawMsg = payload?.message;
  const message = Array.isArray(rawMsg) ? rawMsg.filter(Boolean).join('. ') : rawMsg ?? defaultMessageForStatus(status);
  ```
- [ ] **Task 3 — Audit** (mechanical — run and fix): search `src/features` for `\.code`, `\.status`, `error_code`, `statusCode` in JSX/string contexts; for each hit decide render-vs-branch; convert renders to `err.message` or curated copy; list every touched file in Dev Agent Record. (idea:search_regex with `q: "error_code|err\\.code|\\.status ==="` over `src/features/**` is the starting sweep.)
- [ ] **Task 4 — Shim removal**: delete the local array-joins added by 1.3/5.2 (grep `Array.isArray` under features/).
- [ ] **Task 5 — CLAUDE.md** section per AC 5 (short, 6–8 lines, matches existing doc voice).
- [ ] **Task 6 — Tests** (`__tests__/apiError.test.ts`): array join variants; string passthrough; missing message → status default; details passthrough intact (currentStep readable); errorCopy constants referenced (snapshot the mapping).

## Dev Notes

- Closing audit story — run LAST, after Epics 1–4 merge, so the sweep covers all new screens.
- Do not change error UX layout/design — content consistency only.
- `workflowCurrentStep` (3.3) reads `details` — the join must not touch `details` (it stays the raw body).
- Files: NEW `services/api/errorCopy.ts`; MODIFY `services/api/apiError.ts`, any audited feature files, `CLAUDE.md`; tests.
- [Source: api-contracts.md §0; services/api/apiError.ts L87–124; fenzit-be deferred-work CR3 (GlobalExceptionFilter + ValidationPipe origin)].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
