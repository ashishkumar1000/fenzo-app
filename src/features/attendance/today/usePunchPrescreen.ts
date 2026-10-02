/**
 * usePunchPrescreen — the Today-tab geofence's fix supplier (story 20-3).
 *
 * NFR-11's no-watcher rule, resolved deliberately in the story: there is
 * NO continuous location tracking — the screen fires repeated ONE-SHOT
 * captures (mount/focus, every foreground return, a 30 s cadence while the
 * tab is focused, and once after each punch settles) and the model re-judges
 * freshness against the ticker. The prescreen never nags: a failed capture
 * is silent (the previous fix simply ages past the freshness lease and the
 * punch fails open), and an employee without attendance access captures
 * NOTHING (enabled=false ⇒ zero location work).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { captureAttendanceLocation } from '../../../services/location/attendanceLocation';
import type { PunchFixSample } from './attendanceTodayModel';

/** The capture cadence while the Today tab is focused (the unlock
 *  re-probe bound: a walk into the radius unlocks within ≤ 30 s). */
const CAPTURE_INTERVAL_MS = 30_000;

export function usePunchPrescreen(input: { enabled: boolean }): {
  fix: PunchFixSample | null;
  /** Post-punch settle re-probe (the fresh record may change the fence). */
  recapture: () => void;
  /** Adopt a fix the press flow already captured (see the docblock). */
  adoptFix: (f: { latitude: number; longitude: number }) => void;
} {
  const { enabled } = input;
  const [fix, setFix] = useState<PunchFixSample | null>(null);
  const [focused, setFocused] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const capture = useCallback(async () => {
    // A foreground return can fire while the user is on ANOTHER tab (the
    // screen stays mounted) — the story scopes every capture to the Today
    // tab being focused; the interval already is, and so is this.
    if (!enabledRef.current || !focusedRef.current || inFlight.current) return;
    inFlight.current = true;
    try {
      // A capture can outlive the tab (15 s timeout) — only the mounted +
      // focused winner adopts the fix; a stale adopter would render a
      // fence posture on a tab the user has left.
      const f = await captureAttendanceLocation();
      if (
        mounted.current &&
        focusedRef.current &&
        Number.isFinite(f.latitude) &&
        Number.isFinite(f.longitude)
      ) {
        // capturedAt back-dates to the FIX, not the adoption — the capture's
        // latency (up to the 15 s timeout) must not be gifted to the lease.
        setFix({
          latitude: f.latitude,
          longitude: f.longitude,
          capturedAt: Date.now() - f.fixAgeMs,
        });
      }
    } catch {
      // Silent by design — the old fix ages out and the punch fails open.
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Focus gates the whole cycle (a tab screen stays mounted across tab
  // switches — the cadence must not fire in the background).
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void capture();
      const interval = setInterval(() => void capture(), CAPTURE_INTERVAL_MS);
      return () => {
        setFocused(false);
        clearInterval(interval);
      };
    }, [capture]),
  );

  // Foreground return: the fix from before the background is stale by the
  // time the app is visible again (GPS moved with the user).
  useEffect(() => {
    const sub = AppState.addEventListener('change', appState => {
      if (appState === 'active') void capture();
    });
    return () => sub?.remove();
  }, [capture]);

  const recapture = useCallback(() => {
    void capture();
  }, [capture]);

  /** Adopt a fix the press flow already captured — the freshest fix the
   *  device ever held. Without this, a server-rejected too-far press left
   *  the UI on the fallback posture even though the fence verdict was
   *  known (user-found gap, 2026-10-02): the LOCKED card must render the
   *  moment that fix exists, not whenever the next GPS lottery lands. */
  const adoptFix = useCallback(
    (f: { latitude: number; longitude: number }) => {
      if (!enabledRef.current) return;
      setFix({ latitude: f.latitude, longitude: f.longitude, capturedAt: Date.now() });
    },
    [],
  );

  return { fix, recapture, adoptFix };
}
