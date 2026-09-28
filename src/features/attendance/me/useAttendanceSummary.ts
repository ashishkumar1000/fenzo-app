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
} {
  const [state, setState] = useState<AttendanceSummaryState>(INITIAL);
  const inFlight = useRef<Promise<void> | null>(null);
  const lastLoadedAt = useRef(0);
  const hasLoaded = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchSummary = useCallback(async (mode: 'initial' | 'refresh') => {
    if (inFlight.current) return;
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
      });
    await inFlight.current;
  }, []);

  const refresh = useCallback(() => {
    void fetchSummary('refresh');
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

  return { state, refresh };
}
