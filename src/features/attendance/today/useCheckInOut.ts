/**
 * useCheckInOut.ts — the Today screen's orchestration (Story 16-4, spec
 * D5/D9/D10/D12). Owns: the permission probe (+ foreground re-probe), the
 * latched pre-flight dialog (weekly off / holiday), the tap-time offline
 * re-checks (at tap AND at confirm), capture → submit with one fresh
 * idempotency key per tap, outcome → message/state mapping, the rate-limit
 * countdown, and the freshness contract: the POST response is the render
 * source; forced summary refetches are consistency + 409 recovery.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Alert } from 'react-native';
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
  offlineMessage,
  type TodayOutcomeMessage,
} from './attendanceTodayModel';

const HOLIDAY_CONFIRM_TITLE = "It's a holiday. Check in anyway?";

/** Alert.alert wrapped as a promise — single awaitable decision point. */
function confirmHolidayDialog(): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(HOLIDAY_CONFIRM_TITLE, undefined, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Check in', onPress: () => resolve(true) },
    ]);
  });
}

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
        default:
          setMessage(messageForApiError(err));
      }
    },
    [onAccessDenied, onSettled],
  );

  /** Capture + submit — the shared tail of both buttons. */
  const submit = useCallback(
    async (kind: 'check_in' | 'check_out') => {
      setResolving(true);
      setMessage(null);
      try {
        let fix: AttendanceLocationFix;
        try {
          fix = await captureAttendanceLocation();
        } catch (failure) {
          setMessage({ tone: 'error', text: captureFailureMessage(failure) });
          return;
        }
        // The fix exists — keep it for the display-only distance hint
        // (D7), whatever the server decides about the write.
        setLastFix({ latitude: fix.latitude, longitude: fix.longitude });
        const key = generateIdempotencyKey(); // one fresh UUID v4 per tap
        try {
          if (kind === 'check_in') {
            const res = await attendanceCheckInService.checkIn(fix, key);
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
          handleWriteError(err as ApiError);
        }
      } finally {
        setResolving(false);
      }
    },
    [adopt, handleWriteError],
  );

  /** The button press: latch → offline → day-facts dialog → submit.
   *  One latch release point per path — double-taps are no-ops while the
   *  dialog is up or the request is in flight. */
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
            const confirmed = await confirmHolidayDialog();
            if (!confirmed) return; // no request at all (AC)
            // Confirm is a NEW moment of decision — the network may have
            // changed during the dialog.
            if (await isOfflineNow()) {
              setOnline(false);
              setMessage({ tone: 'error', text: offlineMessage });
              return;
            }
            await submit('check_in');
            return;
          }
          await submit(kind);
        } finally {
          latch.current = false;
          setDialogPending(false);
        }
      })();
    },
    [submit],
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
    message,
    rateLimitedUntil,
    now,
    record,
    lastFix,
    press,
    seedRecord,
    openRemediation,
    dismissMessage,
  };
}
