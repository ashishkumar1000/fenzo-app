/**
 * usePunchPrescreen — the Today-tab geofence's fix supplier (story 20-3).
 *
 * Maps-style bounded stream (user-directed, 2026-10-02): while the Today
 * tab is focused AND the app is foregrounded, a live location watch
 * (balanced priority — the fix WiFi-derived positioning can produce)
 * feeds every update into the prescreen; it stops on blur, background and
 * unmount, so there is NO background watcher, ever — NFR-11's battery
 * rule survives. The 30 s one-shot cadence stays as a fallback beneath
 * the stream, and the punch PRESS still does its own strict capture at
 * the moment of truth (nothing here changes what the server re-judges).
 *
 * The prescreen never nags: a failed capture is silent (the previous fix
 * simply ages past the freshness lease and the punch fails open), and an
 * employee without attendance access captures NOTHING (enabled=false ⇒
 * zero location work).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { watchPosition, unwatch } from 'react-native-nitro-geolocation';
import { captureAttendanceLocation } from '../../../services/location/attendanceLocation';
import type { PunchFixSample } from './attendanceTodayModel';

/** The one-shot cadence — now the FALLBACK beneath the live stream (a
 *  provider that yields no stream updates still gets probed). */
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
  const [appActive, setAppActive] = useState(true);
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

  /** One-shot capture — the fallback probe and the post-punch re-probe. */
  const capture = useCallback(async () => {
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

  // Foreground state: the stream is foreground-only by direction — the
  // watcher must never run behind another app or the lock screen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', appState => {
      setAppActive(appState === 'active');
      if (appState === 'active') void capture();
    });
    return () => sub?.remove();
  }, [capture]);

  // THE STREAM: live updates while (enabled && focused && foregrounded).
  // Balanced priority — the fix WiFi-derived positioning can actually
  // produce — with the same 15 s staleness allowance as the one-shot.
  useEffect(() => {
    if (!enabled || !focused || !appActive) return undefined;
    const token = watchPosition(
      position => {
        const { latitude, longitude } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        if (!mounted.current || !focusedRef.current) return;
        // Stream fixes arrive as they are computed; the fix's own timestamp
        // is the freshest truth about its age.
        const ts = Number(position.timestamp);
        setFix({
          latitude,
          longitude,
          capturedAt:
            Number.isFinite(ts) && ts > 0 ? Math.min(Date.now(), ts) : Date.now(),
        });
      },
      err => {
        // Non-fatal: the 30 s one-shot cadence below stays on as the
        // fallback probe when the stream errors out.
        console.warn('[usePunchPrescreen] location stream error:', err);
      },
      { accuracy: { android: 'balanced', ios: 'best' }, maximumAge: 15_000 },
    );
    return () => unwatch(token);
  }, [enabled, focused, appActive]);

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
