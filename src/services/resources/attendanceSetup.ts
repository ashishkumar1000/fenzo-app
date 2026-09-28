/**
 * services/resources/attendanceSetup.ts
 * ─────────────────────────────────────
 * First-run attendance setup wizard state for the signed-in owner's tenant
 * (Epic 15, Story 15-8 UI over the live 15-2 routes — contract source:
 * fenzit-be `docs/api-contracts.md` → "Attendance setup").
 *
 * A plain function object on the shared `apiClient` (same shape as
 * `offices.ts`), not an `ApiService<T>`. Owner-only: a technician JWT gets
 * 403. Rejects with `ApiError` on failure.
 *
 * The five-step vocabulary mirrors the DB CHECK on
 * `attendance_setup_progress.current_step`; the step ORDER the wizard walks
 * lives in `features/attendance/setup/wizardModel.ts` — this module owns the
 * wire type so a PATCH payload can never be stringly-typed.
 *
 * Documented failures the FE relies on (each code named for the surface
 * that branches on it):
 *   - GET — 200 even when the wizard was never started (`started:false`).
 *     400 `VALIDATION_ERROR` (caller has no tenant); 403 for a technician.
 *   - POST start — idempotent (201 first start / 200 resume; a restart
 *     never resets progress). 409 `ATTENDANCE_SETUP_ALREADY_COMPLETED`
 *     once the wizard is finished — the caller must leave, not retry.
 *   - PATCH step — 404 `ATTENDANCE_SETUP_NOT_STARTED` (progress rows wiped
 *     server-side; restart via POST start), 409
 *     `ATTENDANCE_SETUP_ALREADY_COMPLETED` (another device finished
 *     mid-wizard), 422 for an unknown step value (the FE's typed union
 *     makes that a contract break, not a UI state).
 *   - POST complete — 404 `ATTENDANCE_SETUP_NOT_STARTED`, 409
 *     `ATTENDANCE_SETUP_ALREADY_COMPLETED` (another device finished),
 *     422 `ATTENDANCE_SETUP_INCOMPLETE` (≥1 live office and ≥1 tracked
 *     employee with an office assignment required — the client gate mirrors
 *     this; the 422 stays the authority for races).
 */
import { apiClient } from '../api/apiClient';

/**
 * One wizard step — mirrors 15-2's DB CHECK verbatim. The walking order is
 * the wizard model's (`SETUP_STEPS`), not this module's concern.
 */
export type SetupStep =
  | 'offices'
  | 'timings'
  | 'weekly_off'
  | 'holidays'
  | 'employees';

/**
 * `GET/POST/PATCH /attendance/setup` and `POST /attendance/setup/complete`
 * response — the whole wizard reads its progress from this one shape.
 * `currentStep` is null until the first start; `setupCompletedAt` null
 * until completion. Dates/timestamps are ISO strings.
 */
export interface SetupState {
  started: boolean;
  currentStep: SetupStep | null;
  setupCompletedAt: string | null;
  enabled: boolean;
}

/** Defensive unwrap: a malformed body must not crash the caller's checks
 *  on `started`/`setupCompletedAt` (same pattern as weeklyOffs.ts). */
function normalizeSetupState(
  raw: Partial<SetupState> | null | undefined,
): SetupState {
  return {
    started: raw?.started === true,
    currentStep: raw?.currentStep ?? null,
    setupCompletedAt: raw?.setupCompletedAt ?? null,
    enabled: raw?.enabled === true,
  };
}

/**
 * `GET /attendance/setup` — resume state. 200 even when never started
 * (`started:false`); the caller decides between starting and resuming.
 */
async function getSetup(): Promise<SetupState> {
  const res = await apiClient.get<SetupState>('/attendance/setup');
  return normalizeSetupState(res.data);
}

/**
 * `POST /attendance/setup` — start (201) or resume (200) through the
 * idempotent `attendance_start_setup` RPC; a restart mid-wizard never
 * resets progress. Failures: 409 `ATTENDANCE_SETUP_ALREADY_COMPLETED`.
 */
async function startSetup(): Promise<SetupState> {
  const res = await apiClient.post<SetupState>('/attendance/setup');
  return normalizeSetupState(res.data);
}

/**
 * `PATCH /attendance/setup` — persist the step the owner is now on (the
 * resume pointer; step DATA is written by the step's own screens, never
 * here). Body `{ currentStep }` — typed, no stringly-typed payloads.
 * Failures: 404 `ATTENDANCE_SETUP_NOT_STARTED`, 409
 * `ATTENDANCE_SETUP_ALREADY_COMPLETED`, 422 unknown step.
 */
async function saveSetupStep(step: SetupStep): Promise<SetupState> {
  const res = await apiClient.patch<SetupState>('/attendance/setup', {
    currentStep: step,
  });
  return normalizeSetupState(res.data);
}

/**
 * `POST /attendance/setup/complete` — the module's enable act: sets
 * `setup_completed_at` and `enabled = true` behind the server gates
 * (≥1 live office AND ≥1 tracked employee with an office assignment).
 * Failures: 404 `ATTENDANCE_SETUP_NOT_STARTED`, 409
 * `ATTENDANCE_SETUP_ALREADY_COMPLETED`, 422 `ATTENDANCE_SETUP_INCOMPLETE`.
 */
async function completeSetup(): Promise<SetupState> {
  const res = await apiClient.post<SetupState>('/attendance/setup/complete');
  return normalizeSetupState(res.data);
}

export const attendanceSetupService = {
  getSetup,
  startSetup,
  saveSetupStep,
  completeSetup,
};
