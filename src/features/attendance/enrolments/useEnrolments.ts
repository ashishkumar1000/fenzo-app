/**
 * useEnrolments — the roster tri-state hook (Story 15-9; born in 15-8 as
 * the wizard's enrolment-lite step hook, moved here when the roster screen
 * became its primary owner — the wizard's Employees step is a consumer).
 *
 * The same contract as `useOffices` (15-4): every focus refetches (returning
 * from a pushed screen must show the post-write truth without a manual
 * pull), a latest-wins sequence guard keeps a slow earlier refetch from
 * overwriting a newer one's rows/error, and the screen reads the tri-state
 * as `isLoading && !hasLoaded` → spinner, `error && !hasLoaded` → first-load
 * InlineError + Retry, `error && hasLoaded` → stale banner over live rows.
 *
 * Mutations are PER-ROW (each employee toggles individually; per-row
 * failures retry individually — no bulk route exists, and no "enable all"
 * convenience control is in scope):
 *  - `enable` PUTs `{ officeId }` + the caller's optional `startDate`
 *    (omitted → server-default today; a future date pre-dates the
 *    enrolment) and merges the returned post-write ACCESS STATE into the
 *    row — the response is the truth, not an optimistic flip. The BE write
 *    responses carry NO identity fields (`EnrolmentWriteState`), so the
 *    merge keys on the `employeeId` the write was issued for (a response
 *    treated as a full row once appended a nameless ghost — found live on
 *    device). The caller's switch therefore reverts itself on any failure
 *    (row state never changed).
 *  - `disable` DELETEs (idempotent) and merges the post-disable state.
 *  - `reassign` PUTs `/office` with an explicit `effectiveFrom` and merges
 *    the post-write state. A FUTURE-dated move is invisible to reads (the
 *    view carries only the assignment covering today), so the hook records
 *    it as a scheduled move — `scheduledMove(employeeId)` returns it until
 *    `isMoveSettled` says server truth caught up (see enrolmentsModel);
 *    a today-dated reassign (or any newer write for the employee) clears it.
 *  - Failures land in `rowError(employeeId)` — the row's own banner slot.
 *    404 `ATTENDANCE_EMPLOYEE_NOT_FOUND` and 422
 *    `ATTENDANCE_ASSIGNMENT_NOT_ENROLLED` ALSO refetch the roster (the row
 *    or its enrolment is gone server-side); 409 `ATTENDANCE_OFFICE_ARCHIVED`
 *    ALSO fires `onOfficeArchived` so the host refreshes offices and the
 *    pickers stop offering the archived row.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { enrolmentsService } from '../../../services';
import type { ApiError, EnrolmentOverview, EnrolmentWriteState } from '../../../services';
import { isMoveSettled, type ScheduledMove } from './enrolmentsModel';

export interface UseEnrolmentsOptions {
  /** IST today (YYYY-MM-DD) — decides whether a reassign is a future
   *  move (note recorded) or a today move (row truth updates directly),
   *  and when a recorded move has arrived. */
  today: string;
  /** Fired when a write is rejected 409 `ATTENDANCE_OFFICE_ARCHIVED` —
   *  the host refetches offices so the pickers drop the archived row. */
  onOfficeArchived?: () => void;
}

export interface UseEnrolmentsResult {
  roster: EnrolmentOverview[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: ApiError | null;
  refresh: () => Promise<void>;
  /** The last enable/disable/reassign failure for that employee, or null. */
  rowError: (employeeId: string) => ApiError | null;
  /** A write for that employee is in flight (the row's switch/latch). */
  isRowPending: (employeeId: string) => boolean;
  /** Toggle-on: PUT with the picked office (+ optional start date).
   *  Resolves true when committed. */
  enable: (employeeId: string, officeId: string, startDate?: string) => Promise<boolean>;
  /** Toggle-off / cancel-start: DELETE. Resolves true when the server answered. */
  disable: (employeeId: string) => Promise<boolean>;
  /** FR-6 reassignment with an explicit effective date. Resolves true when
   *  committed; a future-dated commit records the scheduled move. */
  reassign: (employeeId: string, officeId: string, effectiveFrom: string) => Promise<boolean>;
  /** The employee's pending (not-yet-settled) scheduled move, or null. */
  scheduledMove: (employeeId: string) => ScheduledMove | null;
}

export function useEnrolments(
  options: UseEnrolmentsOptions,
): UseEnrolmentsResult {
  const { onOfficeArchived } = options;
  // Latest `today` without re-creating the write callbacks on every render.
  const todayRef = useRef(options.today);
  todayRef.current = options.today;

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
  // Scheduled future moves (FR-6, "Thane from 1 Nov") — client-known
  // intent, mount-scoped, cleared per isMoveSettled. Ref for the same
  // synchronous-write reason as rosterRef; mirrored into state so rows
  // re-render when one is recorded/cleared.
  const movesRef = useRef<Record<string, ScheduledMove>>({});
  const [moves, setMoves] = useState<Record<string, ScheduledMove>>({});

  // Latest-wins: focus refetch + the 404/422-triggered refetches overlap.
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

  const setMove = useCallback((employeeId: string, move: ScheduledMove | null) => {
    const next = { ...movesRef.current };
    if (move) {
      next[employeeId] = move;
    } else {
      delete next[employeeId];
    }
    movesRef.current = next;
    setMoves(next);
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
        if (
          apiError.code === 'ATTENDANCE_EMPLOYEE_NOT_FOUND' ||
          apiError.code === 'ATTENDANCE_ASSIGNMENT_NOT_ENROLLED'
        ) {
          // The employee (or their covering enrolment) is gone server-side
          // — refetch so the row disappears / shows the real state.
          void fetchList();
        } else if (apiError.code === 'ATTENDANCE_OFFICE_ARCHIVED') {
          // The host's office list is stale — the pickers must stop
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
    (employeeId: string, officeId: string, startDate?: string) =>
      runRowWrite(employeeId, () =>
        enrolmentsService.enable(employeeId, officeId, startDate),
      ).then((committed) => {
        if (committed) {
          // Any successful enable supersedes a scheduled move (FR-6's
          // future assignment is destroyed by the AD-8 re-enable plan).
          setMove(employeeId, null);
        }
        return committed;
      }),
    [runRowWrite, setMove],
  );

  const disable = useCallback(
    (employeeId: string) =>
      runRowWrite(employeeId, () => enrolmentsService.disable(employeeId)).then(
        (committed) => {
          if (committed) {
            // Disabling clips/cancels every period — a scheduled move dies
            // with it.
            setMove(employeeId, null);
          }
          return committed;
        },
      ),
    [runRowWrite, setMove],
  );

  const reassign = useCallback(
    (employeeId: string, officeId: string, effectiveFrom: string) =>
      runRowWrite(employeeId, () =>
        enrolmentsService.reassign(employeeId, officeId, effectiveFrom),
      ).then((committed) => {
        if (committed) {
          // A future-dated commit is invisible to reads (the view carries
          // only the assignment covering today) — record it so the row can
          // acknowledge the move; a today-dated one updates row truth
          // directly and clears any older note.
          setMove(
            employeeId,
            effectiveFrom > todayRef.current
              ? { officeId, effectiveFrom }
              : null,
          );
        }
        return committed;
      }),
    [runRowWrite, setMove],
  );

  /** Read during render: the pending move for that employee, or null once
   *  settled (server truth caught up / the move was undone). */
  const scheduledMove = useCallback(
    (employeeId: string): ScheduledMove | null => {
      const move = moves[employeeId];
      if (!move) return null;
      const row = roster.find((r) => r.employeeId === employeeId);
      if (isMoveSettled(row, move, todayRef.current)) {
        return null;
      }
      return move;
    },
    [moves, roster],
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
    reassign,
    scheduledMove,
  };
}
