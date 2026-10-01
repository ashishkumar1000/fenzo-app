/**
 * DayDetailLeaveStages — the day sheet's leave-stage mount layer (Story
 * 20-1, AC 8): the file-budget sibling that keeps DayDetailSheet's two
 * 17-7-grade stage bodies out of its own ~300-line budget. It mounts the
 * REUSED CancelSheet (verbatim — its preview, split copy and
 * already-handled/nothing-actionable shapes ride along untouched) for
 * `leaveCancel`, and the new ConvertStage for `convert`. The write stays
 * host-owned: the host's submitting state and composed failure message
 * pass straight through; the handled notice's OK (whole-sheet close +
 * truth refetch) also routes from here.
 *
 * Returns null when the covering request is not RESOLVED — the caller's
 * condition chain then falls through to the detail stage (no leave CTAs;
 * the AC 11 posture), so a vanishing resolution can never blank a sheet.
 */
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { CancelSheet } from '../leave/CancelSheet';
import { ConvertStage } from './ConvertStage';

export function DayDetailLeaveStages(input: {
  stage: 'leaveCancel' | 'convert';
  workDate: string;
  /** The host-resolved covering request — the CTA gate (AC 11). */
  leaveRequest: LeaveRequestRow | null;
  submitting: boolean;
  errorMessage: string | null;
  onBack: () => void;
  /** The host-owned confirm press (cancel or convert). */
  onConfirm: () => void;
  /** The preview- or write-time handled cue's OK — closes the WHOLE sheet. */
  onHandled: () => void;
}) {
  const {
    stage,
    workDate,
    leaveRequest,
    submitting,
    errorMessage,
    onBack,
    onConfirm,
    onHandled,
  } = input;
  if (leaveRequest == null) return null;

  if (stage === 'convert') {
    return (
      <ConvertStage
        workDate={workDate}
        submitting={submitting}
        errorMessage={errorMessage}
        onBack={onBack}
        onConfirm={onConfirm}
      />
    );
  }

  return (
    <CancelSheet
      request={leaveRequest}
      submitting={submitting}
      errorMessage={errorMessage}
      onBack={onBack}
      onConfirm={onConfirm}
      onDismissHandled={onHandled}
    />
  );
}