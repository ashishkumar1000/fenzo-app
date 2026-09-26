/**
 * useLocateMe — "Use my current location" for the Office map picker
 * (Story 15-4), behind the permission patterns from Stories 7-5/7-6.
 *
 * Requests a FRESH high-accuracy fix (never a cached one) — the owner is
 * placing an office pin, so a stale location would silently misplace it.
 * Permission status is checked/requested BEFORE the fix; the distinct
 * failure shapes map to distinct copy in the screen:
 *
 *   - denied            → "Turn on location to place the pin"
 *   - denied twice      → adds an OS Settings deep-link action
 *   - fix timeout       → its own message, distinct from denied
 *   - other fix failure → generic location failure
 */
import { useCallback, useRef, useState } from 'react';
import { Linking } from 'react-native';
import {
  getCurrentPosition,
  requestLocationPermission,
} from '../../technicianApp/geolocation';

export type LocateErrorKind = 'denied' | 'timeout' | 'failed';

export interface UseLocateMeResult {
  /** Resolves the fresh fix, or null when permission/fix failed (the
   *  screen reads `error` for the message). */
  locate: () => Promise<{ latitude: number; longitude: number } | null>;
  locating: boolean;
  error: LocateErrorKind | null;
  errorMessage: string | null;
  /** True once permission has been denied twice — the screen then offers
   *  the OS Settings deep-link. */
  canOpenSettings: boolean;
  clearError: () => void;
  openSettings: () => void;
}

export const LOCATE_DENIED_MESSAGE = 'Turn on location to place the pin';
export const LOCATE_TIMEOUT_MESSAGE = 'Getting your location took too long. Try again.';
export const LOCATE_FAILED_MESSAGE = 'Could not get your location. Try again.';

export function useLocateMe(): UseLocateMeResult {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<LocateErrorKind | null>(null);
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  const denialCountRef = useRef(0);

  const clearError = useCallback(() => setError(null), []);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const locate = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      let perm;
      try {
        perm = await requestLocationPermission();
      } catch {
        // The permission call itself failed (geolocation rethrows plumbing
        // errors) — the same user-facing shape as a failed fix, never an
        // unhandled rejection.
        setError('failed');
        return null;
      }
      if (perm.status !== 'granted') {
        denialCountRef.current += 1;
        setCanOpenSettings(denialCountRef.current >= 2);
        setError('denied');
        return null;
      }
      try {
        const coords = await getCurrentPosition();
        return { latitude: coords.latitude, longitude: coords.longitude };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message.includes('timed out') ? 'timeout' : 'failed');
        return null;
      }
    } finally {
      setLocating(false);
    }
  }, []);

  const errorMessage =
    error === 'denied'
      ? LOCATE_DENIED_MESSAGE
      : error === 'timeout'
        ? LOCATE_TIMEOUT_MESSAGE
        : error === 'failed'
          ? LOCATE_FAILED_MESSAGE
          : null;

  return { locate, locating, error, errorMessage, canOpenSettings, clearError, openSettings };
}
