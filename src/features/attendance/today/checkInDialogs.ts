/**
 * checkInDialogs.ts — the Today screen's two pre-flight Alert dialogs as
 * awaitable promises (16-4: weekly off / holiday; 17-8: full-day leave),
 * each with its exact copy. The dialogs are the ONLY home of their copy:
 * the 16-4 holding string for ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED is
 * retired — a 409 that escapes the hook's fallback renders the generic
 * server-message error, never dialog copy outside a dialog (17-8 D4).
 *
 * Platform mechanics (verified in the installed RN source, 17-8 D6):
 * Android dialogs are non-cancelable by default — hardware back is a
 * NO-OP while the dialog is up, both buttons always resolve the promise,
 * the awaiting press latch can never strand. `cancelable`/`onDismiss`
 * are NEVER passed; "dismiss" = the Cancel-style button only, on both
 * platforms. The native Alert self-announces on both platforms — no
 * extra AccessibilityInfo call (the settled-outcome announcements in
 * AttendanceTodayView already cover what follows).
 */
import { Alert } from 'react-native';

const HOLIDAY_CONFIRM_TITLE = "It's a holiday. Check in anyway?";

/** Alert.alert wrapped as a promise — single awaitable decision point. */
export function confirmHolidayDialog(): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(HOLIDAY_CONFIRM_TITLE, undefined, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Check in', onPress: () => resolve(true) },
    ]);
  });
}

/**
 * The leave dialog's copy (17-8 D6): the title is the PRD-verbatim ask
 * string; the body is one plain-English line — universally true
 * regardless of multi-day-ness (the FE cannot know span length from
 * these fields) and never says "approved" (the leave may be pending).
 */
const LEAVE_CONFIRM_TITLE =
  "You're on leave today. Checking in will cancel today's leave. Continue?";
const LEAVE_CONFIRM_BODY =
  "Your owner will be notified. Only today's leave is cancelled — your other leave days are not affected.";

/**
 * The FR-9 full-day-leave confirm. Buttons EXACTLY (17-8 D6):
 * "Don't check in" (style 'cancel', FIRST — safe button first = reading
 * order; iOS cancel semantics; Android ignores style and the negative
 * slot carries the safe role) / "Check in" (second). No `isPreferred`
 * (no bolded default on either platform — a deliberate choice on a
 * forfeit surface), no 'destructive' (check-in is a legitimate forward
 * action with a stated side effect; the owner notification makes it
 * reversible-adjacent). Button descriptors are byte-identical in shape
 * to the holiday dialog's.
 */
export function confirmLeaveDialog(): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(LEAVE_CONFIRM_TITLE, LEAVE_CONFIRM_BODY, [
      { text: "Don't check in", style: 'cancel', onPress: () => resolve(false) },
      { text: 'Check in', onPress: () => resolve(true) },
    ]);
  });
}
