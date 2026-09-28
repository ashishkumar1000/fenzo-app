/**
 * useEnrolments — the roster tri-state hook behind the wizard's
 * enrolment-lite Employees step (Story 15-8).
 *
 * The same contract as `useOffices` (15-4): every focus refetches (returning
 * from a pushed screen must show the post-write truth without a manual
 * pull), a latest-wins sequence guard keeps a slow earlier refetch from
 * overwriting a newer one's rows/error, and the screen reads the tri-state
 * as `isLoading && !hasLoaded` → spinner, `error && !hasLoaded` → first-load
 * InlineError + Retry, `error && hasLoaded` → stale banner over live rows.
 *
 * Mutations are PER-ROW (the spec matrix: each employee toggles
 * individually; per-row failures retry individually — no bulk route
 * exists, and no "enable all" convenience control is in scope):
 *  - `enable` PUTs `{ officeId }` (server-default start date) and merges
 *    the returned post-write ACCESS STATE into the row — the response is
 *    the truth, not an optimistic flip. The BE write responses carry NO
 *    identity fields (`EnrolmentWriteState`), so the merge keys on the
 *    `employeeId` the write was issued for (a response treated as a full
 *    row once appended a nameless ghost — found live on device). The
 *    caller's switch therefore reverts itself on any failure (row state
 *    never changed).
 *  - `disable` DELETEs (idempotent) and merges the post-disable state.
 *  - Failures land in `rowError(employeeId)` — the row's own banner slot.
 *    404 `ATTENDANCE_EMPLOYEE_NOT_FOUND` ALSO refetches the roster (the
 *    row is gone server-side); 409 `ATTENDANCE_OFFICE_ARCHIVED` ALSO fires
 *    `onOfficeArchived` so the host refreshes offices and the picker stops
 *    offering the archived row.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { enrolmentsService } from '../../../services';
import type { ApiError, EnrolmentOverview, EnrolmentWriteState } from '../../../services';

export interface UseEnrolmentsOptions {
  /** Fired when an enable is rejected 409 `ATTENDANCE_OFFICE_ARCHIVED` —
   *  the host refetches offices so the inline picker drops the archived
   *  row (matrix: "offices refetched; switch reverts"). */
  onOfficeArchived?: () => void;
}

export interface UseEnrolmentsResult {
  roster: EnrolmentOverview[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: ApiError | null;
  refresh: () => Promise<void>;
  /** The last enable/disable failure for that employee, or null. */
  rowError: (employeeId: string) => ApiError | null;
  /** A write for that employee is in flight (the row's switch/latch). */
  isRowPending: (employeeId: string) => boolean;
  /** Toggle-on: PUT with the picked office. Resolves true when committed. */
  enable: (employeeId: string, officeId: string) => Promise<boolean>;
  /** Toggle-off: DELETE. Resolves true when the server answered. */
  disable: (employeeId: string) => Promise<boolean>;
}

export function useEnrolments(
  options: UseEnrolmentsOptions = {},
): UseEnrolmentsResult {
  const { onOfficeArchived } = options;

  const [roster, setRoster] = useState<EnrolmentOverview[]>([]);
  // Mirror of `roster` for synchronous reads/writes from the write path
  // (the merge must not depend on a state flush — same rationale as
  // `pendingRef` below).
  const rosterRef = useRef<EnrolmentOverview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, ApiError>>({});
  // Pending flags live in a ref (the latch read must not wait for a render)
  // mirrored into state for the rows' spinners.
  const pendingRef = useRef<Record<string, true>>({});
  const [pending, setPending] = useState<Record<string, true>>({});

  // Latest-wins: focus refetch + the 404-triggered refetch can overlap.
  const fetchSeqRef = useRef(0);
  const fetchList = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const rows = await enrolmentsService.list();
      if (seq !== fetchSeqRef.current) return;
      rosterRef.current = rows;
      setRoster(rows);
      setHasLoaded(true);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setError(err as ApiError);
    } finally {
      if (seq === fetchSeqRef.current) setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(() => fetchList(), [fetchList]);

  useFocusEffect(
    useCallback(() => {
      void fetchList();
    }, [fetchList]),
  );

  const setRowPending = useCallback((employeeId: string, value: boolean) => {
    if (value) {
      pendingRef.current = { ...pendingRef.current, [employeeId]: true };
    } else {
      // Drop the key rather than holding `false` entries forever.
      const next = { ...pendingRef.current };
      delete next[employeeId];
      pendingRef.current = next;
    }
    setPending(pendingRef.current);
  }, []);

  const recordRowError = useCallback(
    (employeeId: string, err: ApiError) => {
      setRowErrors((prev) => ({ ...prev, [employeeId]: err }));
    },
    [],
  );

  const clearRowError = useCallback((employeeId: string) => {
    setRowErrors((prev) => {
      if (!(employeeId in prev)) return prev;
      const next = { ...prev };
      delete next[employeeId];
      return next;
    });
  }, []);

  /** Merges the post-write ACCESS STATE into the matching roster row (the
   *  BE write responses carry no identity fields — see the service). The
   *  write is keyed on the `employeeId` it was issued for; an unknown one
   *  (the roster moved under the write) falls back to a refetch. */
  const mergeWriteState = useCallback(
    (employeeId: string, state: EnrolmentWriteState) => {
      const prev = rosterRef.current;
      const i = prev.findIndex((r) => r.employeeId === employeeId);
      if (i === -1) {
        void fetchList();
        return;
      }
      const next = [...prev];
      next[i] = { ...prev[i], ...state };
      rosterRef.current = next;
      setRoster(next);
    },
    [fetchList],
  );

  const runRowWrite = useCallback(
    async (
      employeeId: string,
      write: () => Promise<EnrolmentWriteState>,
    ): Promise<boolean> => {
      if (pendingRef.current[employeeId]) return false; // per-row latch
      setRowPending(employeeId, true);
      clearRowError(employeeId);
      try {
        const state = await write();
        mergeWriteState(employeeId, state);
        return true;
      } catch (err) {
        const apiError = err as ApiError;
        recordRowError(employeeId, apiError);
        if (apiError.code === 'ATTENDANCE_EMPLOYEE_NOT_FOUND') {
          // The employee is gone from the tenant — refetch so the row
          // disappears (matrix: "roster refetch, row gone").
          void fetchList();
        } else if (apiError.code === 'ATTENDANCE_OFFICE_ARCHIVED') {
          // The host's office list is stale — the picker must stop
          // offering the archived row.
          onOfficeArchived?.();
        }
        return false;
      } finally {
        setRowPending(employeeId, false);
      }
    },
    [clearRowError, fetchList, mergeWriteState, onOfficeArchived, recordRowError, setRowPending],
  );

  const enable = useCallback(
    (employeeId: string, officeId: string) =>
      runRowWrite(employeeId, () => enrolmentsService.enable(employeeId, officeId)),
    [runRowWrite],
  );

  const disable = useCallback(
    (employeeId: string) =>
      runRowWrite(employeeId, () => enrolmentsService.disable(employeeId)),
    [runRowWrite],
  );

  const rowError = useCallback(
    (employeeId: string) => rowErrors[employeeId] ?? null,
    [rowErrors],
  );

  const isRowPending = useCallback(
    (employeeId: string) => Boolean(pending[employeeId]),
    [pending],
  );

  return {
    roster,
    isLoading,
    hasLoaded,
    error,
    refresh,
    rowError,
    isRowPending,
    enable,
    disable,
  };
}
