/**
 * useMyMonthly — the self view's month-summary lifecycle (Story 19-6 D3).
 *
 * THE ECHO GATE (the P1 fix): `today` is the PANE'S REPORTED ECHO
 * (`RealMonthReport.today` from me/day-statuses) — this section's ONE
 * canonical clock. me/monthly 422s a `to` past the tenant clock, so the
 * hook NEVER draws a fetch boundary until an echo exists; me/day-statuses
 * has no future-to 422 (span ≤ 62 only), so its echo ALWAYS lands. While
 * `today == null` the hook idles in its loading posture (the pane's own
 * spinner is on screen; the pane Retry → success supplies the echo).
 * Every fetch is `monthlyWindow(yearMonth, canonicalToday)` — clamped, no
 * plain-range fetch exists.
 *
 *  - A `yearMonth` change runs the RUNFETCH posture — data CLEARED,
 *    loading true, error cleared (September's chips must never paint
 *    under October's title).
 *  - Seq-guarded latest-wins (the useMonthStatuses shape): a slow stale
 *    resolve never commits.
 *  - Focus + AppState-`active` are the SILENT in-place refetches ONLY
 *    (parity with useAttendanceSummary's midnight rationale and the
 *    pane's own AppState refresh) — they keep the loaded summary standing
 *    and never clear.
 *  - Retry refires with the SAME clamped window.
 *
 * The hook's own response echo is recorded on the data but is NOT the
 * section's clock — the pane's report is (one canonical echo per D3).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMyMonthly } from '../../../services';
import type { MeMonthlyData } from '../../../services';
import { monthlyWindow } from '../monthly/monthlyModel';
import { ACCESS_REFRESH_MIN_GAP_MS } from './attendanceAccessStore';

/** The fixed error copy (spec copy table) — never err.message (the
 *  normalizer's throw strings are developer-shaped). */
export const MY_MONTHLY_ERROR_COPY =
  "Couldn't load your month summary. Check your connection and try again.";

export function useMyMonthly(input: {
  /** The displayed month (the host's — the pane's label drives it). */
  yearMonth: string;
  /** The PANE'S echo; null until me/day-statuses first lands. */
  today: string | null;
}): {
  data: MeMonthlyData | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  /** 20-1: the silent refresh as an EXPLICIT handle for the screen's
   *  pull-to-refresh — the user-initiated revalidation bypasses the
   *  focus path's ACCESS_REFRESH_MIN_GAP_MS (that gate is focus-only).
   *  Returns the fetch's promise so the refresh spinner can hold until
   *  it settles; errors surface through the ordinary `error` state. */
  refresh: () => Promise<void>;
} {
  const { yearMonth, today } = input;
  const [data, setData] = useState<MeMonthlyData | null>(null);
  // The idle posture IS loading: the first paint waits for the pane's
  // spinner to resolve the echo, so the summary block renders nothing
  // rather than a false empty state.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Seq guard: the latest request's resolve wins; stale AND post-unmount
  // resolves are dropped (the useMonthStatuses shape).
  const seqRef = useRef(0);

  const runFetch = useCallback((fetchYearMonth: string, fetchToday: string) => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    setData(null);
    const { from, to } = monthlyWindow(fetchYearMonth, fetchToday);
    fetchMyMonthly(from, to)
      .then(res => {
        if (!mounted.current || seq !== seqRef.current) return;
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted.current || seq !== seqRef.current) return;
        setError(MY_MONTHLY_ERROR_COPY);
        setLoading(false);
      });
  }, []);

  // The echo gate + the parameter posture: month changes run through here,
  // so a switch clears the old month's chips in the same tick it changes
  // the label. today == null → NO fetch, the idle loading posture holds.
  useEffect(() => {
    if (today === null) return;
    runFetch(yearMonth, today);
  }, [yearMonth, today, retryTick, runFetch]);

  const retry = useCallback(() => setRetryTick(t => t + 1), []);

  // The silent refresh reads the CURRENT month/echo through refs (the
  // todayRef idiom) so its identity stays stable for the host effects.
  const yearMonthRef = useRef(yearMonth);
  yearMonthRef.current = yearMonth;
  const todayRef = useRef(today);
  todayRef.current = today;

  /**
   * The focus/AppState refetch: SILENT and in-place — no clearing, no
   * loading flip (the loaded summary stays standing while it re-validates).
   * A success CLEARS a standing error (a first-load failure followed by a
   * healthy silent refresh must not leave the failure banner above a loaded
   * summary); a failure keeps the data standing (the section renders the
   * stale-note posture over live chips, never the hard first-load copy).
   */
  const refresh = useCallback(() => {
    const fetchToday = todayRef.current;
    if (fetchToday === null) return Promise.resolve();
    const seq = ++seqRef.current;
    const { from, to } = monthlyWindow(yearMonthRef.current, fetchToday);
    // 20-1: the promise is returned for the pull-to-refresh spinner; the
    // focus/AppState callers ignore it as before.
    return fetchMyMonthly(from, to)
      .then(res => {
        if (!mounted.current || seq !== seqRef.current) return;
        setData(res);
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted.current || seq !== seqRef.current) return;
        setError(MY_MONTHLY_ERROR_COPY);
        setLoading(false);
      });
  }, []);

  // Focus fires on EVERY push/pop round trip (a leave-apply round trip
  // would otherwise re-GET the month) — the store's shared min-gap gates
  // only this path; AppState-active (the midnight case) stays unconditional.
  const lastFocusRefreshAt = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastFocusRefreshAt.current < ACCESS_REFRESH_MIN_GAP_MS) {
        return;
      }
      lastFocusRefreshAt.current = Date.now();
      refresh();
    }, [refresh]),
  );

  // Foreground return (the useAttendanceSummary D12 rationale): a screen
  // held across midnight must not keep yesterday's so-far total — focus
  // never fires at 00:00, AppState 'active' does.
  useEffect(() => {
    const sub = AppState.addEventListener('change', appState => {
      if (appState === 'active') refresh();
    });
    return () => sub?.remove();
  }, [refresh]);

  return { data, loading, error, retry, refresh };
}
