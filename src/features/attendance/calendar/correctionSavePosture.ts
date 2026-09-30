/**
 * correctionSavePosture.ts — the correction WRITE's online/failure
 * postures (Story 18-4 D4), split from the sheet that renders them.
 *
 * The press-time NetInfo probe (the useCheckInOut `isOfflineNow` idiom)
 * assumes ONLINE when it itself fails — a dead probe still surfaces the
 * wire's own failure copy instead of a false "offline". Server failures
 * render the server's message verbatim (review-amended owner-facing
 * copy); only a transport failure falls back to the FE connection line
 * (the leave preview-classifier idiom) — mode, fields and note survive.
 */
import NetInfo from '@react-native-community/netinfo';

/** The press-time offline copy (D4). */
export const OFFLINE_SAVE_MESSAGE =
  "You're offline. Correcting attendance needs a working connection.";
/** The transport-failure copy (D4) — server failures render verbatim. */
export const SAVE_TRANSPORT_MESSAGE =
  "Couldn't save the correction. Check your connection.";

/** A failing probe assumes online and lets the write fail as a network
 *  error with its own copy. */
export async function isOfflineNow(): Promise<boolean> {
  try {
    const net = await NetInfo.fetch();
    return net.isConnected === false;
  } catch {
    return false;
  }
}

/** Server failures surface the server's message verbatim; only a transport
 *  failure (network/timeout, or a message-less error) falls back to the FE
 *  connection line. */
export function saveErrorMessage(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  const message = (err as { message?: unknown } | null)?.message;
  if (
    code === 'NETWORK_ERROR' ||
    code === 'TIMEOUT' ||
    typeof message !== 'string' ||
    message.trim() === ''
  ) {
    return SAVE_TRANSPORT_MESSAGE;
  }
  return message;
}
