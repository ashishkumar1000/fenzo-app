/**
 * leaveSplitModel.ts — the revoke/cancel split-outcome copy model
 * (Story 17-7, spec D2/D5). Pure functions over the shipped preview shape
 * (`LeaveActionPreview`): the two hero lines, the nothing-actionable /
 * already-handled shapes, and the one-sentence accessibility composite.
 * No React, no network, no clock (the caller passes today's `YYYY-MM-DD`),
 * and NO date-grammar of its own — range labels come from
 * `leaveStatusModel`'s shared helper (D0: one implementation).
 *
 * PINS:
 * - `keepDates[].reason` ('past' | 'cutoff_passed') is deliberately never
 *   read — the one-time "(already started or past)" parenthetical covers
 *   both; the truth-table test proves two previews differing ONLY in
 *   `reason` produce identical copy.
 * - The stays-word derives from `keepDates[].state` ('approved' →
 *   "Approved", anything else → "Pending") — a Pending request's past days
 *   read "stay Pending"; the literal "stay Approved" is NOT assumed.
 * - The plural rule is count 1 vs 2+ (stays/stay, day/days).
 */
import type { LeaveActionPreview } from '../../../services/resources/attendanceLeave';
import { formatLeaveRange } from './leaveStatusModel';

export type LeaveSplitAction = 'revoke' | 'cancel';

/** The four hero shapes (D2): the two degenerate ones REPLACE the hero. */
export type LeaveSplitShape =
  | 'split'
  | 'whole'
  | 'nothing-actionable'
  | 'already-handled';

export interface LeaveSplitCopy {
  shape: LeaveSplitShape;
  /** "{summary} stays|stay Approved|Pending (already started or past)" —
   *  null unless the shape is 'split'. */
  staysLine: string | null;
  /** "{summary} will be revoked|cancelled" + " (including today)". */
  actionLine: string | null;
  /** The model-emitted a11y composite (D6) — or the replacing notice's
   *  message on the degenerate shapes. */
  compositeLabel: string;
}

const PAST_PARENTHETICAL = ' (already started or past)';
const TODAY_SUFFIX = ' (including today)';

function verbOf(action: LeaveSplitAction): string {
  return action === 'revoke' ? 'revoked' : 'cancelled';
}

/** The "{summary}" range label — the shared grammar over first..last of
 *  the (order-independent) date set. */
function rangeLabel(dates: string[]): string {
  const sorted = [...dates].sort();
  return formatLeaveRange(sorted[0], sorted[sorted.length - 1]);
}

/** day/days pluralisation for the composite's counts. */
function countNoun(count: number): string {
  return `${count} ${count === 1 ? 'day' : 'days'}`;
}

function staysStay(count: number): string {
  return count === 1 ? 'stays' : 'stay';
}

/** The state-aware stays-word — from the EARLIEST kept day (the first one
 *  already started), never from the action context. */
function staysWord(preview: LeaveActionPreview): string {
  const sorted = [...preview.keepDates].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  return sorted[0].state === 'approved' ? 'Approved' : 'Pending';
}

/** Which of the four shapes this preview renders as (D2's two empty-set
 *  branches + whole vs split). */
export function leaveSplitShape(preview: LeaveActionPreview): LeaveSplitShape {
  if (
    preview.actionDates.length === 0 &&
    preview.keepDates.length === 0
  ) {
    return 'already-handled';
  }
  if (preview.actionDates.length === 0) return 'nothing-actionable';
  return preview.keepDates.length === 0 ? 'whole' : 'split';
}

/** The D5 nothing-actionable copy — the action is named, per shape. The
 *  cause clause stays truthful for BOTH keepDates reasons ('past' days AND
 *  'cutoff_passed' days that have not started) without branching on the
 *  reason — the same covering words as the stays parenthetical
 *  (17-7 review). */
export function leaveNothingActionableMessage(
  action: LeaveSplitAction,
): string {
  return `Nothing can be ${verbOf(action)} — the remaining days are already started or past.`;
}

/**
 * The hero copy for a loaded preview. `today` gates the "(including
 * today)" suffix on the action line (today ∈ the affected set).
 */
export function buildLeaveSplitCopy(
  preview: LeaveActionPreview,
  today: string,
): LeaveSplitCopy {
  const shape = leaveSplitShape(preview);
  if (shape === 'already-handled') {
    return {
      shape,
      staysLine: null,
      actionLine: null,
      compositeLabel: 'This request was already handled',
    };
  }
  if (shape === 'nothing-actionable') {
    const message = leaveNothingActionableMessage(preview.action);
    return { shape, staysLine: null, actionLine: null, compositeLabel: message };
  }

  const verb = verbOf(preview.action);
  const actionRange = rangeLabel(preview.actionDates);
  const includesToday = preview.actionDates.includes(today);
  const actionLine = `${actionRange} will be ${verb}${
    includesToday ? TODAY_SUFFIX : ''
  }`;

  if (shape === 'whole') {
    // The degenerate single-line form (D4): no stays group exists.
    return {
      shape,
      staysLine: null,
      actionLine,
      compositeLabel: `${countNoun(preview.actionDates.length)} will be ${verb}, ${actionRange}.`,
    };
  }

  const keepCount = preview.keepDates.length;
  const staysLine = `${rangeLabel(preview.keepDates.map(k => k.date))} ${staysStay(
    keepCount,
  )} ${staysWord(preview)}${PAST_PARENTHETICAL}`;
  const compositeLabel = `${countNoun(keepCount)} ${staysStay(keepCount)} ${staysWord(
    preview,
  )}, ${rangeLabel(preview.keepDates.map(k => k.date))}. ${countNoun(
    preview.actionDates.length,
  )} will be ${verb}, ${actionRange}.`;
  return { shape, staysLine, actionLine, compositeLabel };
}

/** The confirm verb phrase's context (D3/D4): 'whole' names the whole
 *  request ("Revoke leave"), 'split' names the consequence ("Revoke
 *  remaining days"). */
export function leaveConfirmContext(
  preview: LeaveActionPreview,
): 'whole' | 'split' {
  return preview.keepDates.length === 0 ? 'whole' : 'split';
}

/** The per-day chip block's data — 17-6's block, split-only: rendered when
 *  `request.dates` holds days NEITHER hero group covers (a check-in
 *  auto-cancelled day inside the span must be visible at the decision
 *  moment). Returns the FULL per-day list (the block shows the whole
 *  arithmetic) or an empty array for no block. */
export function leavePerDayBlockDates(
  preview: LeaveActionPreview,
): { date: string; state: string }[] {
  const covered = new Set<string>([
    ...preview.actionDates,
    ...preview.keepDates.map(k => k.date),
  ]);
  const uncovered = preview.request.dates.filter(d => !covered.has(d.date));
  return uncovered.length > 0 ? preview.request.dates : [];
}

/** The confirm label per action + context (the D5 table, verbatim). */
export function leaveConfirmLabel(
  action: LeaveSplitAction,
  context: 'whole' | 'split',
): string {
  if (action === 'revoke') {
    return context === 'whole' ? 'Revoke leave' : 'Revoke remaining days';
  }
  return context === 'whole' ? 'Cancel request' : 'Cancel remaining days';
}
