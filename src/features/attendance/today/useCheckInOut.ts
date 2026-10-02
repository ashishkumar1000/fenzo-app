/**
 * useCheckInOut.ts — the Today screen's orchestration (Story 16-4, spec
 * D5/D9/D10/D12; 17-8 adds the full-day-leave branch and the awaited
 * wire-driven 409 fallback, D2–D4). Owns: the permission probe (+
 * foreground re-probe), the latched pre-flight confirmations (weekly off /
 * holiday; full-day leave — since 20-1 rendered by PunchSection as
 * the shared ConfirmDialog, awaited here via the confirmAsk/state pair
 * instead of native Alert promises), the tap-time offline re-checks (at tap AND
 * at confirm), capture → submit with one fresh idempotency key per tap,
 * the 409 leave fallback inside the SAME press continuation (latch held
 * across dialog + retry), outcome → message/state mapping, the
 * rate-limit countdown, and the freshness contract: the POST response is
 * the render source; forced summary refetches are consistency + 409
 * recovery.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  captureAttendanceLocation,
  type AttendanceLocationFix,
} from '../../../services/location/attendanceLocation';
import {
  remediateAttendanceLocation,
  resolveAttendanceLocationState,
  type AttendanceLocationState,
} from '../../../services/location/attendanceLocationPermission';
import { attendanceCheckInService } from '../../../services';
import type {
  AttendanceTodayFacts,
  AttendanceTodayRecord,
} from '../../../services/resources/attendanceMe';
import type { ApiError } from '../../../services/api/apiError';
import { generateIdempotencyKey } from '../../../utils/idempotency';
import {
  MAX_RATE_WINDOW_S,
  captureFailureMessage,
  messageForApiError,
  needsHolidayConfirm,
  needsLeaveConfirm,
  offlineMessage,
  type TodayOutcomeMessage,
} from './attendanceTodayModel';

/** The submit outcome the press continuation branches on: 'leaveConflict'
 *  is a 409 ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED intercepted BEFORE the
 *  generic error handling — the trigger of the awaited wire-driven
 *  fallback (17-8 D4). Only an UNFLAGGED check-in can produce it: a
 *  flag-carrying retry cannot 409 again (the BE gate's !confirmLeaveCancel
 *  conjunct), so a second 409 falls through to handleWriteError — the
 *  generic error, never a re-dialog. */
type SubmitOutcome = 'done' | 'leaveConflict';

async function isOfflineNow(): Promise<boolean> {
  try {
    const net = await NetInfo.fetch();
    return net.isConnected === false;
  } catch {
    // A failing connectivity probe must never strand the tap as a silent
    // no-op: assume online and let the POST fail as NETWORK_ERROR with its
    // own copy.
    return false;
  }
}

export function useCheckInOut(input: {
  today: AttendanceTodayFacts | null | undefined;
  /** Forced, gap-bypassing summary refetch — consistency + 409 recovery. */
  onSettled: () => void;
  /** Forced access-store refresh — the 403 mid-session-disable path. */
  onAccessDenied: () => void;
}) {
  const { today, onSettled, onAccessDenied } = input;

  const [permission, setPermission] = useState<AttendanceLocationState>('granted');
  const [online, setOnline] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [dialogPending, setDialogPending] = useState(false);
  /** Which pre-flight confirmation the PunchSection's ConfirmDialog
   *  is presenting (20-1 port off the native Alerts) — null = none up. */
  const [confirmAsk, setConfirmAsk] = useState<'holiday' | 'leave' | null>(null);
  const [message, setMessage] = useState<TodayOutcomeMessage | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [record, setRecord] = useState<AttendanceTodayRecord | null>(null);
  const [now, setNow] = useState(() => Date.now());
  /** The most recent capture fix (D7): feeds the display-only distance
   *  hint below the button. NFR-11 — nothing is stored or sent twice. */
  const [lastFix, setLastFix] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  const latch = useRef(false);
  /** The resolver for the confirmation the dialog is showing (20-1): set
   *  by askConfirm, resolved exactly once by settleConfirm — the boolean
   *  lands inside the same press continuation that awaited it, so the
   *  press latch keeps spanning dialog + submit exactly as the native
   *  Alert promises did. */
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const recordRef = useRef<AttendanceTodayRecord | null>(null);
  const todayRef = useRef(today);
  todayRef.current = today;

  // Permission probe: mount + every foreground return (the Settings
  // round-trip must never leave a blocked label stuck; spec D3).
  useEffect(() => {
    let cancelled = false;
    const probe = () => {
      void resolveAttendanceLocationState().then(state => {
        if (!cancelled) setPermission(state);
      });
      setNow(Date.now());
    };
    probe();
    const sub = AppState.addEventListener('change', appState => {
      if (appState === 'active') probe();
    });
    return () => {
      cancelled = true;
      // Some environments (jest's RN preset) return no subscription.
      sub?.remove();
    };
  }, []);

  // Connectivity: subscribe, and seed with a fetch (the listener alone can
  // miss the current state).
  useEffect(() => {
    const sub = NetInfo.addEventListener(state => {
      setOnline(state.isConnected === true);
    });
    void NetInfo.fetch().then(state => setOnline(state.isConnected === true));
    return () => sub();
  }, []);

  // Countdown ticker: 1 s while blocked; expiry self-clears. Android
  // pauses JS timers in background — expiry renders on return, and a
  // stale tap merely re-429s harmlessly (uncounted).
  useEffect(() => {
    if (rateLimitedUntil === null) return;
    const tick = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= rateLimitedUntil) setRateLimitedUntil(null);
    }, 1000);
    return () => clearInterval(tick);
  }, [rateLimitedUntil]);

  /** Record adoption — the POST responses own it until the next mount. */
  const adopt = useCallback((next: AttendanceTodayRecord) => {
    recordRef.current = next;
    setRecord(next);
  }, []);

  const seedRecord = useCallback(
    (summaryRecord: AttendanceTodayRecord | null | undefined) => {
      if (summaryRecord === undefined) return; // legacy backend — nothing known
      const local = recordRef.current;
      // Tenant-midnight gate: a local record from a PREVIOUS day is stale
      // (an Android app survives overnight in the background) — the
      // server's today is the truth and the local must not mask it.
      const todayDate = todayRef.current?.date;
      const localIsToday =
        !!local && (!todayDate || local.checkinAt.slice(0, 10) === todayDate);
      if (local && localIsToday) {
        // Mid-session the local record wins unless the summary is FURTHER
        // along (a closed summary over an open local = checked out
        // elsewhere — adopt the server's truth). A summary refetch that
        // carries NO record never clobbers the local one: the refetch can
        // be older than the POST that just landed.
        if (!summaryRecord) return;
        const merged =
          local.checkoutAt || !summaryRecord.checkoutAt ? local : summaryRecord;
        recordRef.current = merged;
        setRecord(merged);
        return;
      }
      recordRef.current = summaryRecord ?? null;
      setRecord(summaryRecord ?? null);
    },
    [],
  );

  const handleWriteError = useCallback(
    (err: ApiError) => {
      switch (err.code) {
        case 'ATTENDANCE_ALREADY_CHECKED_IN':
        case 'ATTENDANCE_ALREADY_CHECKED_OUT': {
          // The previous tap probably landed despite its timeout — recover
          // the true state (forced refetch), never surface an error.
          setMessage(null);
          onSettled();
          return;
        }
        case 'ATTENDANCE_RATE_LIMITED': {
          const awarded =
            typeof err.retryAfterSeconds === 'number' && err.retryAfterSeconds > 0
              ? err.retryAfterSeconds
              : MAX_RATE_WINDOW_S;
          // rateLimitedUntil = now + awarded; the countdown clamp in the
          // model keeps a clock change from extending the block.
          setRateLimitedUntil(Date.now() + awarded * 1000);
          setMessage(messageForApiError(err));
          return;
        }
        case 'ATTENDANCE_NOT_TRACKED':
          // Owner disabled mid-session — catch the access flip now.
          onAccessDenied();
          setMessage(messageForApiError(err));
          return;
        case 'ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED':
          // 17-8 D4 loop guard: the FIRST 409 is intercepted inside
          // submit (the awaited fallback in the press continuation). One
          // that reaches THIS handler is terminal — a flag-carrying
          // retry cannot 409 (the gate's !confirmLeaveCancel conjunct),
          // so this is either the second 409 (a wiring regression) or a
          // check-out contract break: the generic server-message error
          // posture, NEVER a re-dialog. (The 16-4 holding string is
          // retired — the AC copy lives only in the leave dialog.)
          setMessage(messageForApiError(err));
          return;
        default:
          setMessage(messageForApiError(err));
      }
    },
    [onAccessDenied, onSettled],
  );

  /** Capture + submit — the shared tail of both buttons. Returns the
   *  SubmitOutcome for the press continuation to branch on. The flag
   *  (17-8 D3) is passed ONLY by the leave-dialog Continue paths. */
  const submit = useCallback(
    async (
      kind: 'check_in' | 'check_out',
      confirmLeaveCancel?: boolean,
    ): Promise<SubmitOutcome> => {
      setResolving(true);
      setMessage(null);
      try {
        let fix: AttendanceLocationFix;
        try {
          fix = await captureAttendanceLocation();
        } catch (failure) {
          setMessage({ tone: 'error', text: captureFailureMessage(failure) });
          return 'done';
        }
        // The fix exists — keep it for the display-only distance hint
        // (D7), whatever the server decides about the write.
        setLastFix({ latitude: fix.latitude, longitude: fix.longitude });
        const key = generateIdempotencyKey(); // one fresh UUID v4 per call — a retry mints a FRESH key
        try {
          if (kind === 'check_in') {
            const res = await attendanceCheckInService.checkIn(
              fix,
              key,
              confirmLeaveCancel,
            );
            adopt({
              checkinAt: res.checkinAt,
              checkoutAt: null,
              lateMinutes: res.lateMinutes,
              isLate: res.isLate,
              workedMinutes: null,
              earlyCheckout: null,
              earlyCheckoutMinutes: null,
            });
          } else {
            const res = await attendanceCheckInService.checkOut(fix, key);
            // Merge: the check-out 201 carries no late flag — the retained
            // check-in state supplies it (D12).
            const prev = recordRef.current;
            adopt({
              checkinAt: res.checkinAt,
              checkoutAt: res.checkoutAt,
              lateMinutes: prev?.lateMinutes ?? null,
              isLate: prev?.isLate ?? false,
              workedMinutes: res.workedMinutes,
              earlyCheckout: res.earlyCheckout,
              earlyCheckoutMinutes: res.earlyCheckoutMinutes,
            });
          }
          onSettled();
        } catch (err) {
          if (
            kind === 'check_in' &&
            confirmLeaveCancel !== true &&
            (err as ApiError).code === 'ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED'
          ) {
            // The wire-driven fallback trigger (17-8 D4): hand the 409 to
            // the press continuation — which owns the latch and can await
            // the dialog — instead of surfacing it as an error here.
            return 'leaveConflict';
          }
          handleWriteError(err as ApiError);
        }
      } finally {
        setResolving(false);
      }
      return 'done';
    },
    [adopt, handleWriteError],
  );

  /** The confirm-time re-check (16-4 precedent): a dialog confirm is a
   *  NEW moment of decision — the network may have changed during the
   *  dialog. True = proceed to submit; false = the offline message is
   *  showing and the press must stop. */
  const onlineAtConfirm = useCallback(async (): Promise<boolean> => {
    if (!(await isOfflineNow())) return true;
    setOnline(false);
    setMessage({ tone: 'error', text: offlineMessage });
    return false;
  }, []);

  /** The awaited confirmation (20-1): records which dialog the view must
   *  present and returns the verdict promise the press continuation
   *  awaits — the shape the old checkInDialogs promise wrappers gave the
   *  call sites, now resolved by the rendered ConfirmDialog. */
  const askConfirm = useCallback((kind: 'holiday' | 'leave'): Promise<boolean> => {
    return new Promise(resolve => {
      confirmResolverRef.current = resolve;
      setConfirmAsk(kind);
    });
  }, []);

  /** The dialog's verdict (both buttons and every dismissal route here):
   *  one-shot — the resolver is consumed, the dialog state clears, THEN
   *  the awaiting continuation resumes (button ordering in the view can
   *  never double-settle: by the time the confirm handler runs, the
   *  resolver is already null). */
  const settleConfirm = useCallback((confirmed: boolean) => {
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmAsk(null);
    resolve?.(confirmed);
  }, []);

  /** A check-in submit + the awaited wire-driven 409 fallback (17-8 D4).
   *  The fallback fires ONLY on the intercepted 409, and shows the leave
   *  dialog UNCONDITIONALLY — bypassing the pure facts fn (the tap-time
   *  facts said no leave; re-consulting them would yield no dialog; the
   *  server's gate is the authority). Everything runs inside the
   *  caller's press continuation: the latch stays HELD across dialog +
   *  retry, so the button never releases mid-fallback and a second tap
   *  stays a no-op (no double dialog, no double submit). */
  const checkInWithFallback = useCallback(async () => {
    if ((await submit('check_in')) !== 'leaveConflict') return;
    const confirmed = await askConfirm('leave');
    if (!confirmed) return; // fallback-cancel: the dialog was the communication — nothing renders
    if (!(await onlineAtConfirm())) return;
    // Retry = full FRESH capture (the burned fix is stale by
    // dialog-dismiss and would 422 ATTENDANCE_STALE_FIX) + a FRESH
    // idempotency key (submit mints one per call). The flag rides: a
    // second 409 is structurally impossible and would land in
    // handleWriteError as the generic error, never a re-dialog.
    await submit('check_in', true);
  }, [submit, onlineAtConfirm]);

  /** The button press: latch → offline → day-facts dialog → submit.
   *  One latch release point per path (the single finally) — double-taps
   *  are no-ops while a dialog is up or a request is in flight, and the
   *  409 fallback's dialog + retry stay inside the SAME continuation. */
  const press = useCallback(
    (kind: 'check_in' | 'check_out') => {
      if (latch.current) return;
      latch.current = true;
      setDialogPending(true);
      void (async () => {
        try {
          if (await isOfflineNow()) {
            setOnline(false);
            setMessage({ tone: 'error', text: offlineMessage });
            return;
          }
          if (kind === 'check_in' && needsHolidayConfirm(todayRef.current)) {
            const confirmed = await askConfirm('holiday');
            if (!confirmed) return; // no request at all (AC)
            if (await onlineAtConfirm()) await checkInWithFallback();
            return;
          }
          if (
            kind === 'check_in' &&
            needsLeaveConfirm(todayRef.current, 'check_in')
          ) {
            // The full-day-leave pre-flight (17-8 D2) — tap-time facts,
            // re-run on EVERY fresh tap (a remembered flag/decision is
            // never replayed). confirmLeaveCancel rides ONLY this path
            // (D3) — never the holiday dialog, never a plain working-day
            // check-in. Half-day facts never reach this branch
            // (needsLeaveConfirm is full_day-only: strictly nothing).
            const confirmed = await askConfirm('leave');
            if (!confirmed) return; // no request at all (AC)
            if (await onlineAtConfirm()) await submit('check_in', true);
            return;
          }
          if (kind === 'check_in') {
            await checkInWithFallback();
            return;
          }
          await submit('check_out');
        } finally {
          latch.current = false;
          setDialogPending(false);
        }
      })();
    },
    [checkInWithFallback, onlineAtConfirm, submit],
  );

  const openRemediation = useCallback(() => {
    void remediateAttendanceLocation(permission).then(next => setPermission(next));
  }, [permission]);

  const dismissMessage = useCallback(() => setMessage(null), []);

  return {
    permission,
    online,
    resolving,
    dialogPending,
    confirmAsk,
    message,
    rateLimitedUntil,
    now,
    record,
    lastFix,
    press,
    seedRecord,
    settleConfirm,
    openRemediation,
    dismissMessage,
  };
}
