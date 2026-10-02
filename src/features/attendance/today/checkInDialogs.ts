/**
 * checkInDialogs.ts — the Today screen's two pre-flight confirmations'
 * copy contracts (16-4: weekly off / holiday; 17-8: full-day leave).
 * Through 20-1 they rendered as native `Alert.alert` promise wrappers;
 * the 2026-10-01 user decision ports them onto the shared DS
 * `ConfirmDialog`, rendered once by PunchSection and driven by
 * useCheckInOut's `confirmAsk` + `settleConfirm` pair. This module stays
 * the ONLY home of their copy — the 16-4 holding string for
 * ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED is retired — a 409 that escapes
 * the hook's fallback renders the generic server-message error, never
 * dialog copy outside a dialog (17-8 D4).
 *
 * Platform mechanics traded with the modal (17-8 D6 superseded, verified
 * against the ConfirmDialog implementation): Android hardware back now
 * CANCELS instead of no-oping (ConfirmDialog's `onRequestClose` routes
 * to `onCancel`), as do the scrim and the header X — every non-confirm
 * exit resolves `false`, so the awaiting press latch can never strand.
 * The old copy is byte-identical where it was locked: the leave title is
 * the PRD-verbatim ask string and the buttons keep their
 * "Don't check in" / "Check in" labels ("Don't check in" stays the safe
 * secondary; 'Check in' is a legitimate forward action, so the confirm
 * stays `primary`, not `danger` — same ruling 17-8 made against
 * 'destructive').
 */

/** The holiday confirm's body was previously `undefined` (a title-only
 *  native Alert); the card modal needs one short, true line to stand
 *  under the title. Neutral by design — it asserts no attendance
 *  semantics, only that the day is a holiday. */
export const HOLIDAY_DIALOG = {
  title: "It's a holiday. Check in anyway?",
  message: 'You are checking in on a holiday.',
  confirmLabel: 'Check in',
  cancelLabel: 'Cancel',
} as const;

/**
 * The leave dialog's copy (17-8 D6): the title is the PRD-verbatim ask
 * string; the body is one plain-English line — universally true
 * regardless of multi-day-ness (the FE cannot know span length from
 * these fields) and never says "approved" (the leave may be pending).
 * "Don't check in" is the cancel label (the old first, safe button).
 */
export const LEAVE_DIALOG = {
  title:
    "You're on leave today. Checking in will cancel today's leave. Continue?",
  message:
    "Your owner will be notified. Only today's leave is cancelled — your other leave days are not affected.",
  confirmLabel: 'Check in',
  cancelLabel: "Don't check in",
} as const;