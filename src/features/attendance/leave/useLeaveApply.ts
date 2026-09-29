/**
 * useLeaveApply.ts — the Leave apply form's orchestration (Story 17-5,
 * spec D1/D4–D6). Owns: the read-once consumption of the DatePicker's
 * return channel (the RosterScreen idiom), the seq-latched live preview,
 * the submit latch with one fresh idempotency key per tap, the D6 error
 * table, and the access-store observation that pops the screen back when
 * tracking is disabled mid-session (a flip to none/history_only strands
 * this screen — the tab's own guard only fires when the TAB is focused).
 *
 * Race latch (D4): a monotonic request sequence number, not a param key —
 * a From→B→From-A-again triple-key would let a stale response answer the
 * newest request; only the newest seq renders, and a response landing
 * after unmount is dropped.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { attendanceLeaveService } from '../../../services';
import type { LeavePart } from '../../../services/resources/attendanceLeave';
import type { ApiError } from '../../../services/api/apiError';
import { generateIdempotencyKey } from '../../../utils/idempotency';
import {
  refreshAttendanceAccessNow,
  useAttendanceAccess,
} from '../me/attendanceAccessStore';
import type {
  LeaveApplyParams,
  TechnicianRootStackParamList,
} from '../../../navigation/types';
import {
  buildApplyBody,
  buildWireDates,
  changePart,
  clearTo,
  initialLeaveForm,
  minSelectableDate,
  pickFrom,
  pickTo,
  typeOptions,
  type LeaveFormState,
  type LeaveFormStep,
} from './leaveApplyModel';

/** D8 copy — the FE-owned transport/generic lines. */
export const PREVIEW_TRANSPORT_MESSAGE =
  "Couldn't update the working-days count. Check your connection.";
export const SUBMIT_OFFLINE_MESSAGE =
  "You're offline. Submitting leave needs a working connection.";
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';
export const SUBMITTED_ANNOUNCEMENT = 'Leave request submitted';

/** The live preview's render state. In-flight keeps the previous count so
 *  the chip dims in place (no spinner swap, no layout shift). */
export interface LeavePreviewState {
  status: 'idle' | 'loading' | 'ok' | 'rejected' | 'transport';
  workingDays: number | null;
  message: string | null;
}

const IDLE_PREVIEW: LeavePreviewState = {
  status: 'idle',
  workingDays: null,
  message: null,
};

/** D6's POST error table — the server's message, verbatim, except the
 *  FE-owned transport line; the code is what we branch on, never the
 *  string. `ATTENDANCE_NOT_TRACKED` additionally forces the access-store
 *  refresh at the call site (the flip then drives the pop-back). */
function messageForSubmitError(err: ApiError): string {
  if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
    return SUBMIT_OFFLINE_MESSAGE;
  }
  return err.message || GENERIC_ERROR_MESSAGE;
}

type Navigation = NativeStackNavigationProp<
  TechnicianRootStackParamList,
  'LeaveApply'
>;

export function useLeaveApply(input: {
  navigation: Navigation;
  route: { params?: LeaveApplyParams };
}) {
  const { navigation, route } = input;
  const today = route.params?.today ?? null;

  const [step, setStep] = useState<LeaveFormStep>(initialLeaveForm);
  const state = step.state;
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<LeavePreviewState>(IDLE_PREVIEW);
  const [footerError, setFooterError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Every form transition clears the message area (D6: the message clears
   *  on the next param change). */
  const transition = useCallback((next: (state: LeaveFormState) => LeaveFormStep) => {
    setStep(prev => next(prev.state));
    setFooterError(null);
  }, []);

  // --- Live preview: latest-wins GET, only when From exists (D4). ----------
  const seq = useRef(0);
  const { from, to, part } = state;
  useEffect(() => {
    if (!from) {
      seq.current += 1; // invalidate any in-flight GET — no From, no count
      setPreview(IDLE_PREVIEW);
      return;
    }
    const requestSeq = ++seq.current;
    setPreview(prev => ({
      status: 'loading',
      workingDays: prev.workingDays, // the dim-in-place previous value
      message: null,
    }));
    const query = buildWireDates({ from, to, part });
    if (!query) return; // unreachable when from is set (model contract)
    attendanceLeaveService
      .previewLeave(query)
      .then(res => {
        if (!mounted.current || requestSeq !== seq.current) return; // stale
        if (!res.ok) {
          // The gate answers NOT_TRACKED inline on preview too (200) —
          // force the access refresh; the store flip then pops us back.
          if (res.errorCode === 'ATTENDANCE_NOT_TRACKED') {
            refreshAttendanceAccessNow();
          }
          setPreview({ status: 'rejected', workingDays: null, message: res.message });
        } else {
          setPreview({ status: 'ok', workingDays: res.workingDays, message: null });
        }
      })
      .catch(() => {
        if (!mounted.current || requestSeq !== seq.current) return;
        setPreview({ status: 'transport', workingDays: null, message: PREVIEW_TRANSPORT_MESSAGE });
      });
  }, [from, to, part]);

  // --- The DatePicker return channel: read once, then clear (D1). ----------
  const lastPickRef = useRef<string | null>(null);
  useEffect(() => {
    const { pickedDate, context } = route.params ?? {};
    if (!pickedDate || !context) {
      // The clearing setParams landed (or a fresh mount): the signature
      // guard must let the NEXT pick through — even the SAME date re-picked
      // after a Clear, where applying it is a real state change, not a
      // no-op (review: blind-hunter MEDIUM).
      lastPickRef.current = null;
      return;
    }
    const signature = `${context}|${pickedDate}`;
    if (lastPickRef.current === signature) return;
    lastPickRef.current = signature;
    // setParams clearing is async — the signature guard above keeps a
    // pending param from re-dispatching on each render until it clears.
    navigation.setParams({ pickedDate: null, context: null });
    if (context === 'from') transition(s => pickFrom(s, pickedDate));
    else if (context === 'to') transition(s => pickTo(s, pickedDate));
  }, [route.params, navigation, transition]);

  // --- Access flip pop-back (D1): none/history_only while on top. ----------
  const access = useAttendanceAccess();
  const wasEligible = useRef(false);
  const maybePopForAccessFlip = useCallback(() => {
    const accessState = access.access?.attendanceAccess ?? null;
    if (accessState === 'active' || accessState === 'upcoming') {
      wasEligible.current = true;
      return;
    }
    if (
      (accessState === 'none' || accessState === 'history_only') &&
      wasEligible.current &&
      navigation.isFocused()
    ) {
      navigation.goBack();
    }
  }, [access, navigation]);
  useEffect(() => {
    maybePopForAccessFlip();
  }, [maybePopForAccessFlip]);
  // A flip landing while the DatePicker is on top finds isFocused() false
  // and would otherwise be skipped forever — re-check when the form
  // regains focus (review: blind-hunter MEDIUM). This screen's OWN
  // navigation object: on a root-stack screen that is correct (the 15-10
  // getParent() trap applies to tab screens only).
  useEffect(() => {
    return navigation.addListener('focus', maybePopForAccessFlip);
  }, [navigation, maybePopForAccessFlip]);

  // --- Submit (D5): gate → latch → fresh key → announce-and-leave. ---------
  const submitLatch = useRef(false);
  const canSubmit = from != null && reason.trim() !== '';
  const submit = useCallback(() => {
    if (submitLatch.current) return; // double-tap no-op while in flight
    if (!state.from || reason.trim() === '') return; // the disabled gate
    submitLatch.current = true;
    setSubmitting(true);
    const idempotencyKey = generateIdempotencyKey(); // fresh per tap
    attendanceLeaveService
      .applyLeave(buildApplyBody(state, reason.trim()), idempotencyKey)
      // 201 = success for BOTH the create and the replay (same handler) —
      // announce and leave; a submitted write stands even if we unmount.
      .then(() => {
        if (!mounted.current) return;
        AccessibilityInfo.announceForAccessibility(SUBMITTED_ANNOUNCEMENT);
        navigation.goBack();
      })
      .catch((err: ApiError) => {
        if (!mounted.current) return;
        if (err.code === 'ATTENDANCE_NOT_TRACKED') {
          refreshAttendanceAccessNow();
        }
        const message = messageForSubmitError(err);
        setFooterError(message);
        AccessibilityInfo.announceForAccessibility(message);
      })
      .finally(() => {
        submitLatch.current = false;
        if (mounted.current) setSubmitting(false);
      });
  }, [state, reason, navigation]);

  // --- Navigation + control handlers handed to the screen. -----------------
  const openPicker = useCallback(
    (context: 'from' | 'to') => {
      navigation.navigate('DatePicker', {
        title: context === 'from' ? 'Choose start date' : 'Choose end date',
        value: context === 'from' ? state.from : state.to,
        today: today ?? undefined,
        minDate:
          context === 'from'
            ? today
              ? minSelectableDate(today)
              : undefined
            : state.from ?? undefined,
        returnTo: 'LeaveApply',
        context,
      });
    },
    [state, today, navigation],
  );

  return {
    today,
    from,
    to,
    part,
    reason,
    setReason: useCallback(
      (next: string) => {
        setReason(next);
        setFooterError(null);
      },
      [],
    ),
    typeOptions: typeOptions(state),
    resetNote: step.resetNote,
    preview,
    canSubmit,
    submitting,
    footerError,
    changePart: useCallback(
      (next: LeavePart) => transition(s => changePart(s, next)),
      [transition],
    ),
    clearTo: useCallback(() => transition(clearTo), [transition]),
    openFromPicker: useCallback(() => openPicker('from'), [openPicker]),
    openToPicker: useCallback(() => openPicker('to'), [openPicker]),
    submit,
  };
}
