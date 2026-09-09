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

import type { StatusKey } from '../../theme';

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

/**
 * The step vocabulary, one keyed record — label AND Badge status together,
 * so a new step can never be added to one map and silently drift from the
 * other (the label would render while the chip falls back to neutral).
 */
const STEPS: Record<string, { label: string; status: StatusKey }> = {
  on_my_way: { label: 'On my way', status: 'progress' },
  arrived: { label: 'Arrived', status: 'done' },
  in_progress: { label: 'In progress', status: 'progress' },
  photos_uploaded: { label: 'Photos uploaded', status: 'progress' },
  signature_captured: { label: 'Signature captured', status: 'progress' },
  completed: { label: 'Completed', status: 'done' },
};

const isText = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

/**
 * Human label for one raw workflow-step value (`on_my_way`, `arrived`, …).
 * Unknown values render RAW rather than crashing (the unknown-value rule
 * above) — the row and the banner must never disagree about a step's name,
 * so this is the feature's single copy of the vocabulary.
 */
export function notificationStepLabel(step: unknown): string {
  if (!isText(step)) return BANNER_FALLBACK_TEXT;
  // Object.hasOwn — `STEPS[step]` alone would resolve inherited prototype
  // keys ('toString', 'constructor') to functions.
  return Object.hasOwn(STEPS, step) ? STEPS[step].label : step;
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
 * The banner's structured fields, extracted per-field: whatever the payload
 * carries is rendered, whatever is missing is dropped (the redesigned toast
 * shows avatar/name, job chip, and step chip independently). `step` is the
 * raw workflow value; `stepLabel` its human label.
 */
export interface NotificationBannerParts {
  technicianName: string | null;
  jobNumber: string | null;
  step: string | null;
  stepLabel: string | null;
}

/**
 * Extracts the banner fields from one broadcast payload, each independently:
 * a partial payload keeps its good fields instead of collapsing to the
 * generic line. Never returns non-string values (the `isText` gate above).
 */
export function bannerPartsFromEvent(
  payload: JobStatusEventPayload | null | undefined,
): NotificationBannerParts {
  const empty: NotificationBannerParts = {
    technicianName: null,
    jobNumber: null,
    step: null,
    stepLabel: null,
  };
  if (!payload || typeof payload !== 'object') return empty;

  const { job_number: jobNumber, step, technician_name: technicianName } = payload;
  const hasStep = isText(step);

  return {
    technicianName: isText(technicianName) ? technicianName : null,
    jobNumber: isText(jobNumber) ? jobNumber : null,
    step: hasStep ? step : null,
    stepLabel: hasStep ? notificationStepLabel(step) : null,
  };
}

/**
 * Badge status color for the step chip — Done-green for terminal-ish steps,
 * In-progress blue for the rest, neutral for unknown/drifted values (same
 * fixed vocabulary as `<Badge>`; no synonyms). Reads the same keyed record
 * as `notificationStepLabel`, so label and color can never drift apart.
 */
export function notificationStepStatus(step: string | null): StatusKey {
  if (step === null) return 'neutral';
  return Object.hasOwn(STEPS, step) ? STEPS[step].status : 'neutral';
}

/**
 * Composes the one-line banner text ("A · B · C") from the parts — the
 * accessibility label and the all-fields-missing degraded render. With no
 * parts at all, falls back to `BANNER_FALLBACK_TEXT`. Always non-empty.
 * The length guard also drops empty-string parts (an exported API must not
 * emit stray separators).
 */
export function bannerTextFromParts(parts: NotificationBannerParts): string {
  const line = [parts.technicianName, parts.jobNumber, parts.stepLabel]
    .filter((v): v is string => v !== null && v.length > 0)
    .join(' · ');
  return line.length > 0 ? line : BANNER_FALLBACK_TEXT;
}
