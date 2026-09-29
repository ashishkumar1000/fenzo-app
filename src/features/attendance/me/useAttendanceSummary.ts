/**
 * useAttendanceSummary.ts — the FR-4 summary fetch for the technician's
 * attendance screens (Story 15-10).
 *
 * House tri-state contract (useOffices/useEnrolments pattern): first-load
 * spinner, error + Retry on first-load failure, and a refetch failure that
 * leaves the last-loaded rows standing (the screen flags them stale).
 * Focus refetches share the access store's min-gap — rapid tab switches
 * stay cheap, and a state flip (upcoming → active) re-reads the summary on
 * the next focus/foreground just like access does.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { attendanceMeService } from '../../../services';
import type { AttendanceSummary } from '../../../services';
import {
  ACCESS_REFRESH_MIN_GAP_MS,
  refreshAttendanceAccessOnFocus,
} from './attendanceAccessStore';

export interface AttendanceSummaryState {
  summary: AttendanceSummary | null;
  /** True only while the FIRST load is in flight (nothing to show yet). */
  isLoading: boolean;
  /** Human-readable failure message for the first-load error state. */
  error: string | null;
  /** True when a REFETCH failed over live rows (screen may show a stale note). */
  isStale: boolean;
}

const INITIAL: AttendanceSummaryState = {
  summary: null,
  isLoading: true,
  error: null,
  isStale: false,
};

export function useAttendanceSummary(enabled: boolean): {
  state: AttendanceSummaryState;
  refresh: () => void;
  /** Gap-bypassing forced refetch (16-4): the post-write consistency
   *  refetch and the 409 state-recovery path must never be silently
   *  swallowed by the focus min-gap — a recovery landing inside the gap
   *  would leave the button on the wrong action. Deduped via the same
   *  in-flight guard, so parallel forced calls stay one request. */
  refreshNow: () => Promise<void>;
} {
  const [state, setState] = useState<AttendanceSummaryState>(INITIAL);
  const inFlight = useRef<Promise<void> | null>(null);
  const lastLoadedAt = useRef(0);
  const hasLoaded = useRef(false);
  const mounted = useRef(true);
  const queuedForced = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchSummary = useCallback(async (mode: 'initial' | 'refresh' | 'forced') => {
    if (inFlight.current) {
      // A forced caller during an in-flight GET must NOT join it (the GET
      // may have hit the wire before the triggering POST committed — the
      // attendanceAccessStore's never-join rule); queue a follow-up
      // instead, so the 409-recovery/post-write read is never pre-event
      // truth.
      if (mode === 'forced') queuedForced.current = true;
      return inFlight.current;
    }
    if (
      mode === 'refresh' &&
      Date.now() - lastLoadedAt.current < ACCESS_REFRESH_MIN_GAP_MS
    ) {
      return;
    }
    inFlight.current = attendanceMeService
      .getSummary()
      .then(summary => {
        if (!mounted.current) return;
        lastLoadedAt.current = Date.now();
        hasLoaded.current = true;
        setState({ summary, isLoading: false, error: null, isStale: false });
      })
      .catch((err: { message?: string }) => {
        if (!mounted.current) return;
        if (!hasLoaded.current) {
          setState(prev => ({
            ...prev,
            isLoading: false,
            error:
              err?.message ??
              'Could not load your attendance details. Check your connection and try again.',
          }));
        } else {
          // Refetch failure over live rows: keep them standing, flag stale.
          setState(prev => ({ ...prev, isStale: true }));
        }
      })
      .finally(() => {
        inFlight.current = null;
        if (queuedForced.current && mounted.current) {
          queuedForced.current = false;
          void fetchSummary('forced');
        }
      });
    await inFlight.current;
  }, []);

  const refresh = useCallback(() => {
    void fetchSummary('refresh');
  }, [fetchSummary]);

  const refreshNow = useCallback(() => {
    return fetchSummary('forced') as Promise<void>;
  }, [fetchSummary]);

  const wasEnabled = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        wasEnabled.current = false;
        return undefined;
      }
      // Access and summary refresh together on focus — one tab switch,
      // both truths re-checked under the same min-gap. Mode rides the
      // hasLoaded ref (never a state closure) — EXCEPT on an enabled
      // false→true transition (e.g. a history_only → active re-enable
      // inside the gap): the previous period's rows must never render as
      // fresh truth, so that transition always forces the fetch.
      const mode = !hasLoaded.current || !wasEnabled.current ? 'initial' : 'refresh';
      wasEnabled.current = true;
      refreshAttendanceAccessOnFocus();
      void fetchSummary(mode);
      return undefined;
    }, [enabled, fetchSummary]),
  );

  // Foreground return (spec D12): a screen held across midnight (or long
  // backgrounded) must not keep yesterday's day facts — navigation focus
  // never fires at 00:00, AppState 'active' does. Min-gapped like focus;
  // the access store's own lifecycle refresh runs its foreground path.
  useEffect(() => {
    if (!enabled) return undefined;
    const sub = AppState.addEventListener('change', appState => {
      if (appState === 'active') void fetchSummary('refresh');
    });
    return () => sub?.remove();
  }, [enabled, fetchSummary]);

  return { state, refresh, refreshNow };
}
