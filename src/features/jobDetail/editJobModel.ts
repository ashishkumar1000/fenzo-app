/**
 * editJobModel.ts — the pure logic behind the Edit job sheet, kept out of the
 * component so it can be unit-tested without rendering anything.
 *
 * Three concerns:
 *   buildPatch          — diff the draft against the loaded detail; only changed
 *                         fields go on the wire (an empty patch is a 422).
 *   scheduleWindowError — pre-validate a one-sided schedule edit against the
 *                         OTHER stored bound (the server 422s the same case).
 *   resolveSaveError    — turn a failed PATCH into the sheet's next move
 *                         (message, close the sheet, refresh the roster).
 */
import type {
  ApiError,
  JobDetail,
  JobPriority,
  UpdateJobEditFields,
  UpdateJobRequest,
} from '../../services';

/** What the sheet's form holds while editing. */
export interface EditJobDraft {
  description: string;
  scheduledStart: Date;
  notesForTechnician: string;
  priority: JobPriority;
  /** `null` = the selected tile was tapped again (deselect) — never a patch field. */
  technicianId: string | null;
}

export const EDIT_STARTED_MESSAGE = "This job has already started and can't be changed";
export const TECHNICIAN_GONE_MESSAGE = 'That technician is no longer available';
/**
 * Shown when a save fails without a usable server message (empty, or an
 * unrecognized shape) — always better feedback than a blank error line.
 */
export const SAVE_FAILED_MESSAGE = "Couldn't save your changes. Please try again.";

/**
 * True when an edited text field should go on the wire.
 *
 * A field the user emptied (`next === ''`) is deliberately NOT sent: the API
 * cannot clear a field (null/absent both mean "leave unchanged"), so the prior
 * value survives. Whitespace-only edits count as empty after trimming.
 */
function textChanged(next: string, prev: string | null): boolean {
  const trimmed = next.trim();
  return trimmed !== '' && trimmed !== (prev ?? '');
}

/**
 * Diffs the draft against the loaded detail, returning only the changed
 * fields — or null when nothing changed (Save is disabled on null).
 *
 * Dates are compared as instants (`.getTime()`), not strings: the detail's
 * ISO strings may lack milliseconds (`…:00Z`) while `toISOString()` always
 * emits them (`…:00.000Z`), and a string compare would invent a diff.
 */
export function buildPatch(job: JobDetail, draft: EditJobDraft): UpdateJobEditFields | null {
  // Built as the edit-fields half of `UpdateJobRequest` — a diff can never
  // accidentally carry `status` (that variant is only for cancel, and mixing
  // the two is a 422).
  const patch: UpdateJobEditFields = {};

  const description = draft.description.trim();
  if (textChanged(description, job.description)) {
    patch.description = description;
  }

  // Same instant, compared as instants; sent back as ISO UTC.
  if (draft.scheduledStart.getTime() !== new Date(job.scheduledStart).getTime()) {
    patch.scheduledStart = draft.scheduledStart.toISOString();
  }

  const notes = draft.notesForTechnician.trim();
  if (textChanged(notes, job.notesForTechnician)) {
    patch.notesForTechnician = notes;
  }

  if (draft.priority !== job.priority) {
    patch.priority = draft.priority;
  }

  // `null` (deselect) means "keep the prior technician" — the API cannot
  // unassign a job, so a deselection is simply omitted from the patch.
  if (draft.technicianId !== null && draft.technicianId !== job.technicianId) {
    patch.technicianId = draft.technicianId;
  }

  return Object.keys(patch).length ? patch : null;
}

/** Same copy New job uses for a past slot — one rule, one wording. */
export const PAST_SLOT_MESSAGE = 'Pick a time in the future.';

/**
 * Parity with New job: a rescheduled slot in the past is rejected client-side
 * (the date picker's `minimumDate` only constrains the date half, so picking
 * today and an earlier time slips through it). Only fires when the slot itself
 * changed — notes/priority on an already-past job must stay savable.
 */
export function pastSlotError(patch: UpdateJobRequest): string | null {
  if ('status' in patch) return null;
  if (patch.scheduledStart && new Date(patch.scheduledStart).getTime() <= Date.now()) {
    return PAST_SLOT_MESSAGE;
  }
  return null;
}

/**
 * Pre-validates a schedule edit against the stored window before any request:
 * a new start past the stored end, or a new end before the stored start.
 * Both directions are covered even though the sheet only edits the start —
 * the server 422s exactly this inversion, so the check mirrors it.
 */
export function scheduleWindowError(patch: UpdateJobRequest, job: JobDetail): string | null {
  // A cancel carries no schedule fields — nothing to pre-check.
  if ('status' in patch) return null;
  const start = patch.scheduledStart ?? job.scheduledStart;
  const end = patch.scheduledEnd ?? job.scheduledEnd;
  if (!end) return null;
  if (new Date(end).getTime() < new Date(start).getTime()) {
    return "End time can't be before start time";
  }
  return null;
}

/** What the sheet should do after a failed save. */
export interface SaveErrorResolution {
  /** Copy to render inline above the footer. */
  message: string;
  /** 409 — the job started while it was being edited; close the sheet (the parent refetches the detail). */
  closeSheet: boolean;
  /** 404 with a technician in the patch — refresh the roster store. */
  refreshRoster: boolean;
}

/**
 * Backend `message` fields occasionally arrive as an array of validation
 * strings rather than one string (class-validator style). Flatten for display;
 * Story 5.4 centralizes this — keep it local until then.
 */
export function flattenApiMessage(message: string): string {
  return Array.isArray(message) ? message.join('. ') : message ?? '';
}

export function resolveSaveError(patch: UpdateJobRequest, error: ApiError): SaveErrorResolution {
  if (error.code === 'JOB_NOT_MODIFIABLE') {
    return { message: EDIT_STARTED_MESSAGE, closeSheet: true, refreshRoster: false };
  }
  if (error.status === 404 && 'technicianId' in patch) {
    return { message: TECHNICIAN_GONE_MESSAGE, closeSheet: false, refreshRoster: true };
  }
  // 422 keeps the server's (useful, validation-specific) copy; anything else
  // with no usable message falls back to the generic one — never a blank line.
  const message = flattenApiMessage(error.message);
  return {
    message: message || SAVE_FAILED_MESSAGE,
    closeSheet: false,
    refreshRoster: false,
  };
}
