/**
 * useMonthStatuses — the month day-status lifecycle (Story 18-3 D3).
 *
 * Owns everything hosts must not re-implement (19-5/19-6 embed it):
 *  - a FRESH fetch on mount AND on every `yearMonth`/scope change — no
 *    cache (the 17-6 param-landing precedent: an 18-4 correction must be
 *    visible on the next visit);
 *  - a LAST-REQUEST-WINS sequence guard — fast ‹ › paging drops stale
 *    resolves, so a slow older month can never paint over a newer one;
 *  - month-level loading (the host renders its centred spinner) and the
 *    ordinary error state (`InlineError` + `retry`) — the me path's 403
 *    ATTENDANCE_NOT_TRACKED is deliberately this same ordinary state (the
 *    access UI is 19-6's concern).
 *
 * `today` is the wire echo (spec-18-3 D2) — data-driven, never the device
 * clock. Midnight-crossing staleness of today's cell is accepted until the
 * next fetch.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchDayStatuses,
  fetchMyDayStatuses,
  monthRange,
  type DayStatusRow,
} from '../../../services/resources/attendanceDayStatus';

/** Owner scope: one employee. `me` scope: the JWT identity. */
export type MonthStatusesScope =
  | { kind: 'owner'; employeeId: string }
  | { kind: 'me' };

export interface MonthStatuses {
  /** Rows keyed by workDate — empty while loading or after a change. */
  data: ReadonlyMap<string, DayStatusRow>;
  /** The tenant-local date echo from the wire; null before first success. */
  today: string | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const FALLBACK_ERROR = "Couldn't load the month. Check your connection and try again.";

function errorMessage(err: unknown): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message !== '' ? message : FALLBACK_ERROR;
}

export function useMonthStatuses(input: {
  scope: MonthStatusesScope;
  yearMonth: string;
}): MonthStatuses {
  const { scope, yearMonth } = input;
  const [data, setData] = useState<ReadonlyMap<string, DayStatusRow>>(
    () => new Map(),
  );
  const [today, setToday] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  // Scope identity as a string: callers pass a fresh object literal every
  // render, so an object dep would refetch on each one.
  const scopeKey = scope.kind === 'owner' ? `owner:${scope.employeeId}` : 'me';

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Seq guard: the latest request's resolve wins; stale resolves AND
  // post-unmount resolves are dropped.
  const seqRef = useRef(0);

  const runFetch = useCallback(
    (employeeId: string | null, from: string, to: string) => {
      const seq = ++seqRef.current;
      setLoading(true);
      setError(null);
      setData(new Map());
      const request =
        employeeId != null
          ? fetchDayStatuses(employeeId, from, to)
          : fetchMyDayStatuses(from, to);
      request
        .then(res => {
          if (!mounted.current || seq !== seqRef.current) return;
          const map = new Map<string, DayStatusRow>();
          for (const row of res.days) map.set(row.workDate, row);
          setData(map);
          setToday(res.today);
          setLoading(false);
        })
        .catch(err => {
          if (!mounted.current || seq !== seqRef.current) return;
          setError(errorMessage(err));
          setLoading(false);
        });
    },
    [],
  );

  useEffect(() => {
    const { from, to } = monthRangeSafe(yearMonth);
    runFetch(scope.kind === 'owner' ? scope.employeeId : null, from, to);
    // scopeKey collapses the scope object; retryTick drives retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, yearMonth, retryTick, runFetch]);

  const retry = useCallback(() => setRetryTick(t => t + 1), []);

  return { data, today, loading, error, retry };
}

/** monthRange guarded for the hook path — a malformed yearMonth is a
 *  programmer error, but the hook must not crash a mounted screen: the
 *  degenerate bounds fail the fetch (422 server-side) into the ordinary
 *  error state instead. */
function monthRangeSafe(yearMonth: string): { from: string; to: string } {
  try {
    return monthRange(yearMonth);
  } catch {
    return { from: yearMonth, to: yearMonth };
  }
}
