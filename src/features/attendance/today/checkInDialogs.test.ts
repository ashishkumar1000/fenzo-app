/**
 * Copy-contract tests for checkInDialogs (16-4/17-8, ported to the
 * ConfirmDialog in 20-1): the two pre-flight confirmations' strings are
 * LOCKED product copy — the leave title is the PRD-verbatim ask string
 * and its body never says "approved" (the leave may be pending). These
 * test the requirement (the copy), not the transport — the hook and view
 * tests prove the dialog presents it.
 */
import { HOLIDAY_DIALOG, LEAVE_DIALOG } from './checkInDialogs';

describe('the holiday confirmation copy', () => {
  it('keeps the 16-4 title verbatim and a neutral body (no semantics asserted)', () => {
    expect(HOLIDAY_DIALOG.title).toBe("It's a holiday. Check in anyway?");
    expect(HOLIDAY_DIALOG.message).toBe('You are checking in on a holiday.');
  });

  it('keeps the button vocabulary: Check in forward, Cancel as the safe exit', () => {
    expect(HOLIDAY_DIALOG.confirmLabel).toBe('Check in');
    expect(HOLIDAY_DIALOG.cancelLabel).toBe('Cancel');
  });
});

describe('the full-day-leave confirmation copy (17-8 D6)', () => {
  it('keeps the PRD-verbatim title', () => {
    expect(LEAVE_DIALOG.title).toBe(
      "You're on leave today. Checking in will cancel today's leave. Continue?",
    );
  });

  it('body: the owner-notification line + the only-today scoping, verbatim', () => {
    expect(LEAVE_DIALOG.message).toBe(
      "Your owner will be notified. Only today's leave is cancelled — your other leave days are not affected.",
    );
  });

  it('the body NEVER says "approved" (the leave may be pending)', () => {
    expect(LEAVE_DIALOG.message.toLowerCase()).not.toContain('approved');
  });

  it("keeps the button vocabulary: 'Check in' forward, 'Don't check in' as the safe exit", () => {
    expect(LEAVE_DIALOG.confirmLabel).toBe('Check in');
    expect(LEAVE_DIALOG.cancelLabel).toBe("Don't check in");
  });
});