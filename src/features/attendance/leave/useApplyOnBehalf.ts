/**
 * useApplyOnBehalf — the apply-on-behalf screen's own state/submit hook
 * (Story 17-6, spec D4). Deliberately NOT `useLeaveApply`: that hook is
 * typed to the technician `LeaveApply` route and its preview GET — the
 * whole `MeLeaveController` is `@Roles(TECHNICIAN)` and `RolesGuard` is
 * exact-membership, so an owner JWT answers 403 — the on-behalf form has
 * NO live working-days preview and discovers the count from the 201 view.
 *
 * Shared brain: the form transitions are `leaveApplyModel`'s (the same
 * single-date rule), the picker channel is the same read-once-then-clear
 * idiom, and the From picker's floor is the DEVICE-local today−7 as a
 * CONVENIENCE ONLY (no server `today` exists on this route — commented at
 * the call site); the authoritative ladders (`LEAVE_BEFORE_START_DATE`,
 * `LEAVE_TOO_OLD`) are server-rendered verbatim on submit — never a client
 * decision.
 *
 * Error posture (spec D4): server messages verbatim;
 * `ATTENDANCE_NOT_TRACKED` on-behalf means the TARGET employee is untracked
 * — inline server message only, NO access-store refresh, form stays;
 * `ATTENDANCE_EMPLOYEE_NOT_FOUND` gets the FE-owned line. Success:
 * announce "Leave applied for {name}" and land on OwnerLeave `all` (a
 * born-approved request is invisible in the Pending filter).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { enrolmentsService } from '../../../services';
import { attendanceLeaveService } from '../../../services';
import type { ApiError } from '../../../services/api/apiError';
import type { LeavePickerEmployee } from './EmployeePickerSheet';
import { generateIdempotencyKey } from '../../../utils/idempotency';
import { istTodayDate } from '../../../utils/istDate';
import type {
  ApplyOnBehalfParams,
  RootStackParamList,
} from '../../../navigation/types';
import {
  buildApplyBody,
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
import {
  GENERIC_ERROR_MESSAGE,
  SUBMIT_OFFLINE_MESSAGE,
} from './useLeaveApply';

export const EMPLOYEE_NOT_FOUND_MESSAGE =
  "This person isn't in your team anymore.";
export const APPLIED_ANNOUNCEMENT_PREFIX = 'Leave applied for';

/** D4 — the picker keeps TRACKED rows only (`attendanceStartDate != null`). */
export function trackedEmployees(
  rows: { employeeId: string; employeeName: string; officeName: string | null; attendanceStartDate: string | null }[],
): LeavePickerEmployee[] {
  return rows
    .filter(row => row.attendanceStartDate != null)
    .map(({ employeeId, employeeName, officeName }) => ({
      employeeId,
      employeeName,
      officeName,
    }));
}

type Navigation = NativeStackNavigationProp<
  RootStackParamList,
  'ApplyOnBehalf'
>;

function messageForSubmitError(err: ApiError): string {
  if (err.code === 'ATTENDANCE_EMPLOYEE_NOT_FOUND') {
    return EMPLOYEE_NOT_FOUND_MESSAGE;
  }
  if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
    return SUBMIT_OFFLINE_MESSAGE;
  }
  return err.message || GENERIC_ERROR_MESSAGE;
}

export function useApplyOnBehalf(input: {
  navigation: Navigation;
  route: { params?: ApplyOnBehalfParams };
}) {
  const { navigation, route } = input;

  // The picked team member — from params (deep link) until the picker
  // replaces it; the CTA entry opens the picker immediately.
  const [employee, setEmployee] = useState<LeavePickerEmployee | null>(() => {
    const p = route.params;
    return p?.employeeId && p.employeeName
      ? { employeeId: p.employeeId, employeeName: p.employeeName, officeName: p.officeName ?? null }
      : null;
  });
  const [pickerVisible, setPickerVisible] = useState(false);

  // The roster (tracked rows only), fetched once on mount.
  const [roster, setRoster] = useState<LeavePickerEmployee[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  // A failed roster GET must not masquerade as "no team members yet" —
  // the picker shows an error + Retry instead (17-6 review P3).
  const [rosterError, setRosterError] = useState(false);
  const mounted = useRef(true);
  const loadRoster = useCallback(() => {
    setRosterLoading(true);
    setRosterError(false);
    enrolmentsService
      .list()
      .then(rows => {
        if (!mounted.current) return;
        setRoster(trackedEmployees(rows));
      })
      .catch(() => {
        if (!mounted.current) return;
        setRoster([]);
        setRosterError(true);
      })
      .finally(() => {
        if (mounted.current) setRosterLoading(false);
      });
  }, []);
  useEffect(() => {
    mounted.current = true;
    loadRoster();
    return () => {
      mounted.current = false;
    };
  }, [loadRoster]);

  // Open the picker while nobody is picked (the CTA's cold entry).
  useEffect(() => {
    if (employee == null) setPickerVisible(true);
  }, [employee]);

  const [step, setStep] = useState<LeaveFormStep>(initialLeaveForm);
  const state = step.state;
  const [reason, setReason] = useState('');
  const [footerError, setFooterError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Every form transition clears the message area (the 17-5 D6 rule). */
  const transition = useCallback(
    (next: (state: LeaveFormState) => LeaveFormStep) => {
      setStep(prev => next(prev.state));
      setFooterError(null);
    },
    [],
  );

  // --- The DatePicker return channel: read once, then clear (F4). ----------
  const lastPickRef = useRef<string | null>(null);
  const { pickedDate, context } = route.params ?? {};
  useEffect(() => {
    if (!pickedDate || !context) {
      lastPickRef.current = null;
      return;
    }
    const signature = `${context}|${pickedDate}`;
    if (lastPickRef.current === signature) return;
    lastPickRef.current = signature;
    navigation.setParams({ pickedDate: null, context: null });
    if (context === 'from') transition(s => pickFrom(s, pickedDate));
    else if (context === 'to') transition(s => pickTo(s, pickedDate));
  }, [pickedDate, context, navigation, transition]);

  const openPicker = useCallback(
    (slot: 'from' | 'to') => {
      navigation.navigate('DatePicker', {
        title: slot === 'from' ? 'Choose start date' : 'Choose end date',
        value: slot === 'from' ? state.from : state.to,
        // CONVENIENCE floor only (device-local today−7) — there is NO
        // server `today` on this route; the authoritative past-date and
        // staleness ladders are the server's, rendered verbatim on submit.
        minDate:
          slot === 'from'
            ? minSelectableDate(istTodayDate())
            : (state.from ?? undefined),
        returnTo: 'ApplyOnBehalf',
        context: slot,
      });
    },
    [state, navigation],
  );

  const onPickEmployee = useCallback(
    (employeeId: string) => {
      const picked =
        roster.find(row => row.employeeId === employeeId) ?? null;
      setEmployee(picked);
      setPickerVisible(false);
      setFooterError(null);
    },
    [roster],
  );

  // --- Submit: gate → latch → fresh key → announce-and-land-All. -----------
  const submitLatch = useRef(false);
  const canSubmit = employee != null && state.from != null && reason.trim() !== '';
  const submit = useCallback(() => {
    if (submitLatch.current) return; // double-tap no-op while in flight
    if (employee == null || !state.from || reason.trim() === '') return;
    submitLatch.current = true;
    setSubmitting(true);
    setFooterError(null);
    const idempotencyKey = generateIdempotencyKey(); // fresh per tap
    attendanceLeaveService
      .applyOnBehalf(
        { employeeId: employee.employeeId, ...buildApplyBody(state, reason.trim()) },
        idempotencyKey,
      )
      // 201 = success for BOTH the create and the replay; the count is
      // discovered from the returned view (no live preview exists here).
      .then(() => {
        if (!mounted.current) return;
        AccessibilityInfo.announceForAccessibility(
          `${APPLIED_ANNOUNCEMENT_PREFIX} ${employee.employeeName}`,
        );
        // Param merge pops back to the owner's Leave screen, landing on All
        // so the born-approved request is visible immediately (spec D4).
        navigation.navigate('OwnerLeave', { tab: 'all' });
      })
      .catch((err: ApiError) => {
        if (!mounted.current) return;
        // NOT_TRACKED here = the TARGET employee is untracked — inline
        // server message only; deliberately NO access-store refresh (that
        // seam is the technician's own session, not this employee's).
        const message = messageForSubmitError(err);
        setFooterError(message);
        AccessibilityInfo.announceForAccessibility(message);
      })
      .finally(() => {
        submitLatch.current = false;
        if (mounted.current) setSubmitting(false);
      });
  }, [employee, state, reason, navigation]);

  return {
    employee,
    roster,
    rosterLoading,
    rosterError,
    reloadRoster: loadRoster,
    pickerVisible,
    closePicker: useCallback(() => setPickerVisible(false), []),
    /** The selected card's "Change" — re-open over the current pick. */
    reopenPicker: useCallback(() => setPickerVisible(true), []),
    onPickEmployee,
    from: state.from,
    to: state.to,
    part: state.part,
    reason,
    setReason: useCallback((next: string) => {
      setReason(next);
      setFooterError(null);
    }, []),
    typeOptions: typeOptions(state),
    resetNote: step.resetNote,
    canSubmit,
    submitting,
    footerError,
    changePart: useCallback(
      (next: LeaveFormState['part']) => transition(s => changePart(s, next)),
      [transition],
    ),
    clearTo: useCallback(() => transition(clearTo), [transition]),
    openFromPicker: useCallback(() => openPicker('from'), [openPicker]),
    openToPicker: useCallback(() => openPicker('to'), [openPicker]),
    submit,
  };
}
