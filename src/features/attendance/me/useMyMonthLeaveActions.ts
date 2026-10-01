/**
 * useMyMonthLeaveActions — the AttendanceMyMonth day sheet's leave-write
 * host (Story 20-1, ACs 3, 9, 10, 11). The sheet renders; this decides —
 * the same split LeaveHistorySection used for 17-7 (the write lifecycle
 * never lives in the sheet).
 *
 * Two independent concerns:
 *  - RESOLUTION (AC 11): when a leave day's sheet opens, the covering
 *    LeaveRequestRow is resolved from a FRESH `listMyLeave()` walk (first
 *    page limit 50, cursor walked up to 3 pages — never a stale cache,
 *    never a second store). While it runs — or if the id cannot be found
 *    inside the cap — `leaveRequest` stays null and the sheet shows NO
 *    leave CTAs (absent, not disabled). A miss is the recorded fallback:
 *    leave history remains the full cancel surface.
 *  - WRITES: cancel (the 17-7 posture verbatim: ref latch — a same-tick
 *    double-tap would file two events; the endpoint is state-guarded with
 *    no idempotency key) and convert = cancel + a FRESH full-day apply
 *    (the locked 2026-10-01 semantics: the owner approved only the half,
 *    so the full day goes back as a NEW pending request carrying the
 *    original reason verbatim). A fresh UUID v4 idempotency key rides
 *    every apply attempt.
 *
 * Failures classify through `classifyLeaveWriteFailure` — the one home:
 * already-handled → the sheet's notice whose OK closes the WHOLE sheet
 * and refetches truth; everything else keeps the stage open with the
 * message. The convert's apply leg composes AC 10's partial-failure
 * line (the half-day request is already cancelled) on top of the server's
 * verbatim message; a retry re-runs cancel (BE own-retry answers 200 for
 * a last-cause `employee_cancel`) then the apply.
 *
 * Success does NOT touch anything here but the state: the parent's
 * `onWriteSuccess` (the pane's non-clearing `report.refresh`) re-renders
 * the day map in place — and a FAILED settle does the same through
 * `onWriteFailure` (ACs 9/10: the stage's message must not sit over a
 * stale behind-truth; the already-handled posture refetches via its OK) — and the refreshed row naturally re-drives this
 * hook's `leaveId` input (a full cancel → null → everything clears; a
 * convert → the NEW request's id → the resolution walk re-fires).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceLeaveService } from '../../../services';
import type { ApiError } from '../../../services/api/apiError';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import { generateIdempotencyKey } from '../../../utils/idempotency';
import {
  LEAVE_WRITE_GENERIC_MESSAGE,
  classifyLeaveWriteFailure,
  convertPartialFailureMessage,
  type LeaveSheetActionState,
} from '../leave/ownerLeaveModel';

/** The resolution fetch shape: page size + the cursor-walk cap (AC 11). */
const RESOLVE_PAGE_LIMIT = 50;
const RESOLVE_MAX_PAGES = 3;

/** Fresh walk — a leave day's covering request, never a cached list. */
async function resolveLeaveRequest(
  id: string,
): Promise<LeaveRequestRow | null> {
  let cursor: string | undefined;
  for (let page = 0; page < RESOLVE_MAX_PAGES; page++) {
    const list = await attendanceLeaveService.listMyLeave(
      cursor ? { limit: RESOLVE_PAGE_LIMIT, cursor } : { limit: RESOLVE_PAGE_LIMIT },
    );
    const hit = list.data.find(row => row.id === id);
    if (hit) return hit;
    if (!list.nextCursor) return null;
    cursor = list.nextCursor;
  }
  return null;
}

export function useMyMonthLeaveActions(input: {
  /** The picked day's active-leave id (null = sheet closed / no leave). */
  leaveId: string | null;
  /** The sheet's workDate — the convert apply leg's single date. */
  workDate: string | null;
  /** The post-write truth refresh (the pane's non-clearing refresh). */
  onWriteSuccess: () => void;
  /** (ACs 9/10, review 2026-10-01) A FAILED settle that leaves the sheet
   *  open also refetches day truth — the message alone updates the stage,
   *  but the glyphs/row behind it may already have moved (a raced owner
   *  action, the partial convert); a stale sheet must not outlive the
   *  failure. The already-handled posture is NOT included — its OK
   *  routes through dismissHandled, which refreshes. */
  onWriteFailure: () => void;
}): {
  /** The resolved row (null while resolving or on a capped miss). */
  leaveRequest: LeaveRequestRow | null;
  /** True while a fresh walk for the CURRENT leaveId is in flight — the
   *  sheet's resolving shimmer cue (a blank CTA slot is silence). */
  resolving: boolean;
  /** The host-owned write state the sheet renders. */
  actionState: LeaveSheetActionState;
  /** The cancel write — fired by the dialog's confirm (the one-more-time
   *  press, 20-1); the stage's own confirm is the error-retry. */
  cancelLeave: () => void;
  /** The convert write — fired by the dialog's confirm (the one-more-time
   *  press, 20-1); the stage's own confirm is the error-retry. */
  convertFullDay: () => void;
  /** The handled notice's OK — refetch truth; the sheet closes itself. */
  dismissHandled: () => void;
} {
  const { leaveId, workDate, onWriteSuccess, onWriteFailure } = input;

  const [leaveRequest, setLeaveRequest] = useState<LeaveRequestRow | null>(null);
  const [resolving, setResolving] = useState(false);
  const [actionState, setActionState] = useState<LeaveSheetActionState>({
    kind: 'idle',
  });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Latest-wins on both the resolution walk and the write latch: refs so
  // the write callbacks stay stable for the sheet's props.
  const seqRef = useRef(0);
  const latchRef = useRef(false);
  const requestRef = useRef<LeaveRequestRow | null>(null);
  requestRef.current = leaveRequest;
  const workDateRef = useRef<string | null>(workDate);
  workDateRef.current = workDate;
  const onWriteSuccessRef = useRef(onWriteSuccess);
  onWriteSuccessRef.current = onWriteSuccess;
  const onWriteFailureRef = useRef(onWriteFailure);
  onWriteFailureRef.current = onWriteFailure;

  // AC 11: the resolution fires whenever a leave day's sheet opens —
  // a change of leaveId (day switch, post-write re-drive) re-walks fresh.
  useEffect(() => {
    if (leaveId == null) {
      seqRef.current += 1; // anything in flight is dead on landing
      setResolving(false);
      setLeaveRequest(null);
      setActionState({ kind: 'idle' });
      return;
    }
    const seq = ++seqRef.current;
    setResolving(true); // 20-1 (user ask): the sheet's shimmer cue
    setLeaveRequest(null); // resolving → the CTAs are absent, not disabled
    setActionState({ kind: 'idle' });
    void resolveLeaveRequest(leaveId)
      .then(row => {
        if (!mounted.current || seq !== seqRef.current) return;
        setResolving(false);
        setLeaveRequest(row); // a capped miss stays null (recorded fallback)
      })
      .catch(() => {
        if (!mounted.current || seq !== seqRef.current) return;
        setResolving(false);
        setLeaveRequest(null); // fail-CLEAR: never CTA on an unresolved id
      });
  }, [leaveId]);

  const cancelLeave = useCallback(() => {
    const request = requestRef.current;
    if (request == null || latchRef.current) return;
    latchRef.current = true;
    setActionState({ kind: 'submitting', action: 'cancel' });
    attendanceLeaveService
      .cancelLeave(request.id)
      .then(() => {
        if (!mounted.current) return;
        // BE own-retry answers 200 here too — one success path. The state
        // drop to idle is the sheet's morph-back cue; the parent refreshes
        // the day map (the hook does NOT clear anything).
        setActionState({ kind: 'idle' });
        onWriteSuccessRef.current();
      })
      .catch((err: ApiError) => {
        if (!mounted.current) return;
        const failure = classifyLeaveWriteFailure(err, 'cancel');
        if (failure.kind === 'already-handled') {
          setActionState({ kind: 'handled' }); // OK → dismissHandled
          return;
        }
        setActionState({ kind: 'error', message: failure.message });
        onWriteFailureRef.current(); // ACs 9/10: re-truth behind the stage
      })
      .finally(() => {
        latchRef.current = false;
      });
  }, []);

  const convertFullDay = useCallback(() => {
    const request = requestRef.current;
    const date = workDateRef.current;
    if (request == null || date == null || latchRef.current) return;
    latchRef.current = true;
    setActionState({ kind: 'submitting', action: 'convert' });
    void (async () => {
      try {
        try {
          // Leg 1 — cancel. A retry after a failed apply hits the BE's
          // own-retry path (last cause `employee_cancel`, same actor →
          // 200): never a duplicate cancellation (AC 10).
          await attendanceLeaveService.cancelLeave(request.id);
        } catch (err) {
          if (!mounted.current) return;
          const failure = classifyLeaveWriteFailure(err as ApiError, 'cancel');
          if (failure.kind === 'already-handled') {
            setActionState({ kind: 'handled' });
          } else {
            setActionState({ kind: 'error', message: failure.message });
            onWriteFailureRef.current(); // ACs 9/10: re-truth behind the stage
          }
          return; // the apply leg must not run on a failed cancel
        }
        try {
          // Leg 2 — re-file: fresh full-day request, reason verbatim, one
          // new UUID per press (the apply endpoint's X-Idempotency-Key).
          await attendanceLeaveService.applyLeave(
            { startDate: date, part: 'full_day', reason: request.reason },
            generateIdempotencyKey(),
          );
          if (!mounted.current) return;
          setActionState({ kind: 'idle' });
          onWriteSuccessRef.current();
        } catch (err) {
          if (!mounted.current) return;
          const apiErr = err as ApiError;
          // The cancel leg landed, so the employee's half-day is gone —
          // compose AC 10's plain line under the server's message.
          const failure = classifyLeaveWriteFailure(apiErr, 'apply');
          const base =
            failure.kind === 'already-handled'
              ? apiErr.message || LEAVE_WRITE_GENERIC_MESSAGE
              : failure.message;
          setActionState({
            kind: 'error',
            message: convertPartialFailureMessage(base),
          });
          onWriteFailureRef.current(); // ACs 9/10: re-truth behind the stage
        }
      } finally {
        latchRef.current = false;
      }
    })();
  }, []);

  const dismissHandled = useCallback(() => {
    setActionState({ kind: 'idle' });
    // AC 9's list-refetch leg: the day map re-runs while the sheet closes.
    onWriteSuccessRef.current();
  }, []);

  return {
    leaveRequest,
    resolving,
    actionState,
    cancelLeave,
    convertFullDay,
    dismissHandled,
  };
}