/**
 * useFlashMessage — a transient banner message with an auto-dismiss timer.
 *
 * The attendance settings screens have no toast library (`Alert.alert` is a
 * blocking modal, poor UX for "Saved!"). They instead render an
 * `InlineNotice tone="success"` for ~1.5s after a successful write. This
 * hook owns that message and its timer so both screens share one
 * implementation, and clears the pending timer on unmount.
 *
 * Usage:
 *   const success = useFlashMessage();
 *   ... success.flash('Weekly off saved');
 *   ... {success.message ? <InlineNotice tone="success" message={success.message}
 *         onDismiss={success.dismiss} /> : null}
 *
 * Each flash is also announced through AccessibilityInfo (15-6 review
 * iteration 1, user decision): the banner is transient and visually
 * inserted, so without an announcement a screen-reader user never learns a
 * save succeeded. Announcing here means every consumer screen gets it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** How long a flash message stays on screen. */
export const FLASH_MESSAGE_MS = 1500;

export interface UseFlashMessageResult {
  /** The message to render, or null when nothing is showing. */
  message: string | null;
  /** Show `next` and (re)start the auto-dismiss timer. */
  flash: (next: string) => void;
  /** Clear the message immediately (the banner's dismiss button). */
  dismiss: () => void;
}

export function useFlashMessage(
  durationMs: number = FLASH_MESSAGE_MS,
): UseFlashMessageResult {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const flash = useCallback(
    (next: string) => {
      clearTimer();
      setMessage(next);
      timerRef.current = setTimeout(() => setMessage(null), durationMs);
      // Announce even when the string is unchanged (a repeated flash of the
      // same message still re-arms the timer, and the user re-ran an
      // action worth hearing about).
      AccessibilityInfo.announceForAccessibility(next);
    },
    [clearTimer, durationMs],
  );

  const dismiss = useCallback(() => {
    clearTimer();
    setMessage(null);
  }, [clearTimer]);

  return { message, flash, dismiss };
}
