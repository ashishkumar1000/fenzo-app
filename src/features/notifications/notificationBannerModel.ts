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
import type { WorkflowTemplateStep } from '../../services/resources/jobs';

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

const isText = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

/**
 * Human label for one raw workflow-step value. Reads from template steps only
 * (Story 4.5 dynamic). If no template available, returns the raw step key.
 */
export function notificationStepLabel(step: unknown, templateSteps?: WorkflowTemplateStep[] | null): string {
  if (!isText(step)) return BANNER_FALLBACK_TEXT;

  // If template steps provided, look up the label there (Story 4.5).
  if (templateSteps && Array.isArray(templateSteps)) {
    const found = templateSteps.find(s => s.key === step);
    if (found) return found.label;
  }

  // No template: return raw step key.
  return step;
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
 * Badge status color for the step chip. Derives from the step's `setsStatus`
 * field in the workflow template (Story 4.5 dynamic). Unknown steps → neutral.
 */
export function notificationStepStatus(
  step: string | null,
  templateSteps?: WorkflowTemplateStep[] | null,
): StatusKey {
  if (step === null || !templateSteps || !Array.isArray(templateSteps)) return 'neutral';

  const found = templateSteps.find(s => s.key === step);
  if (!found) return 'neutral';

  switch (found.setsStatus) {
    case 'completed':
      return 'done';
    case 'in_progress':
      return 'progress';
    default:
      return 'scheduled';
  }
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
