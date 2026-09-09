/**
 * notificationBannerModel.ts — pure banner-text logic for owner
 * notifications (Story 3.3). No React, no network, no sockets.
 *
 * The broadcast event delivers the raw `notifications` row, snake_case —
 * `job_number` / `step` / `technician_name` live INSIDE `payload` (Story
 * 3.1's RPC shape), never at the top level. Anything unexpected renders as
 * the generic fallback copy — never crash, never render `undefined` (same
 * unknown-value rule as `features/jobDetail/eventLabels.ts`).
 *
 * Step values are the raw workflow step (`on_my_way`, `arrived`, …) — the
 * same vocabulary `eventLabels.ts` and `stepperModel.ts` own copies of; this
 * feature owns its own for the same reason: cross-feature vocabulary stays
 * duplicated, not shared (see stepperModel.ts's comment).
 */

/** How long a banner stays visible before the hook dismisses it. */
export const BANNER_VISIBLE_MS = 4000;

/** Generic copy when the event payload doesn't carry the three fields. */
export const BANNER_FALLBACK_TEXT = 'Job status updated';

/**
 * The `payload` JSONB as Story 3.1's `advance_workflow_step` RPC builds it.
 * All fields optional here — shape drift is handled, not trusted.
 */
export interface JobStatusEventPayload {
  job_number?: unknown;
  step?: unknown;
  technician_name?: unknown;
}

const STEP_LABELS: Record<string, string> = {
  on_my_way: 'On my way',
  arrived: 'Arrived',
  in_progress: 'In progress',
  photos_uploaded: 'Photos uploaded',
  signature_captured: 'Signature captured',
  completed: 'Completed',
};

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Human label for one raw workflow-step value (`on_my_way`, `arrived`, …).
 * Unknown values render RAW rather than crashing (the unknown-value rule
 * above) — the row and the banner must never disagree about a step's name,
 * so this is the feature's single copy of the vocabulary.
 */
export function notificationStepLabel(step: unknown): string {
  if (!isText(step)) return BANNER_FALLBACK_TEXT;
  // Object.hasOwn — `STEP_LABELS[step] ?? step` alone would resolve
  // inherited prototype keys ('toString', 'constructor') to functions.
  return Object.hasOwn(STEP_LABELS, step) ? STEP_LABELS[step] : step;
}

/**
 * Unwraps the banner fields out of the `on('broadcast')` callback message.
 * Verified live on device (2026-09-09, Task 0 spike Metro log) — THREE
 * nesting levels: supabase-js's broadcast callback delivers
 * `{ type: 'broadcast', event, payload: ENVELOPE, meta }`; the
 * `broadcast_changes` envelope inside `payload` is
 * `{ id, table, schema, operation, old_record, record }` where `record` is
 * the raw `notifications` row; and the RPC's JSONB (job_number / step /
 * technician_name) sits one level deeper still, in `record.payload`. (The
 * story spec's "raw row" wording was off by two wrappers; see Dev Agent
 * Record.) Each unwrap is conditional, so the channel-wrapped shape, a bare
 * envelope, a bare row, or a bare field-object keep working — shape drift
 * lands on the fallback copy, never a crash.
 */
export function eventRowPayload(message: unknown): JobStatusEventPayload | null {
  let candidate = message as Record<string, unknown> | null | undefined;

  // Level 0: channel wrapper → the broadcast_changes envelope. Gated on
  // `'event' in candidate` so the envelope/row below (which never carry an
  // `event` key) are not double-unwrapped by this branch.
  if (candidate && typeof candidate === 'object' && 'event' in candidate && 'payload' in candidate) {
    candidate = candidate.payload as typeof candidate;
  }

  // Level 1: broadcast_changes envelope → the notifications row.
  if (candidate && typeof candidate === 'object' && 'record' in candidate) {
    candidate = candidate.record as typeof candidate;
  }

  // Level 2: the notifications row → the RPC's JSONB payload.
  if (candidate && typeof candidate === 'object' && 'payload' in candidate) {
    const inner = candidate.payload;
    if (inner && typeof inner === 'object') {
      return inner as JobStatusEventPayload;
    }
  }

  return (candidate ?? null) as JobStatusEventPayload | null;
}

/**
 * Builds the banner line for one broadcast event: "{technician_name} ·
 * {job_number} · {step label}". Any missing/empty/drifted field falls back
 * to `BANNER_FALLBACK_TEXT` — a partial payload is not worth a partial
 * sentence. Always returns a non-empty string (never `null`): the refetch
 * the hook runs alongside this happens regardless of payload quality.
 */
export function bannerTextFromEvent(
  payload: JobStatusEventPayload | null | undefined,
): string {
  if (!payload || typeof payload !== 'object') return BANNER_FALLBACK_TEXT;

  const { job_number: jobNumber, step, technician_name: technicianName } = payload;

  if (!isText(jobNumber) || !isText(step) || !isText(technicianName)) {
    return BANNER_FALLBACK_TEXT;
  }

  return `${technicianName} · ${jobNumber} · ${notificationStepLabel(step)}`;
}
