/**
 * Hook tests for useCheckInOut (Story 16-4, spec D5/D9/D10/D12) — the
 * flows the unit-pure model cannot prove: the pre-flight dialog round-trip
 * (dismiss sends NOTHING), the double-tap latch, the 409 state-recovery
 * split (ALREADY_* recovers, DUPLICATE_RESOURCE does not), the Retry-After
 * countdown, the offline re-check, the check-out merge, and the
 * seedRecord freshness contract. Alert is a spy whose button callbacks the
 * tests invoke; NetInfo goes through the root mock's __setNetInfoState
 * seam (plain functions — resetAllMocks-safe). Unmounts are act-wrapped:
 * the mount-time permission probe resolves a promise that lands after the
 * last await.
 */
import { Alert } from 'react-native';
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import {
  // The root __mocks__ module auto-applies for this package under jest and
  // carries these mock-only helpers; the real package's types do not.
  // @ts-expect-error — mock-only named exports
  __setNetInfoState,
  // @ts-expect-error — mock-only named exports
  __resetNetInfoMock,
} from '@react-native-community/netinfo';
import {
  captureAttendanceLocation,
} from '../../../services/location/attendanceLocation';
import {
  attendanceCheckInService,
} from '../../../services';
import {
  resolveAttendanceLocationState,
} from '../../../services/location/attendanceLocationPermission';
import type { AttendanceTodayFacts } from '../../../services/resources/attendanceMe';
import { useCheckInOut } from './useCheckInOut';

jest.mock('../../../services/location/attendanceLocation', () => ({
  captureAttendanceLocation: jest.fn(),
}));

jest.mock('../../../services/location/attendanceLocationPermission', () => ({
  resolveAttendanceLocationState: jest.fn(),
  remediateAttendanceLocation: jest.fn(),
}));

jest.mock('../../../services', () => ({
  attendanceCheckInService: {
    checkIn: jest.fn(),
    checkOut: jest.fn(),
  },
}));

const capture = captureAttendanceLocation as jest.Mock;
const checkIn = attendanceCheckInService.checkIn as jest.Mock;
const checkOut = attendanceCheckInService.checkOut as jest.Mock;
const resolveState = resolveAttendanceLocationState as jest.Mock;

const FIX = {
  latitude: 12.97,
  longitude: 77.59,
  accuracyM: 12,
  mocked: null,
  provider: 'fused',
  fixAgeMs: 1200,
};

const workingDayFacts: AttendanceTodayFacts = {
  date: '2026-09-29',
  isWeeklyOff: false,
  isHoliday: false,
  holidayName: null,
  isWorkingDay: true,
  leaveState: null,
  leavePart: null,
};
const weeklyOffFacts: AttendanceTodayFacts = { ...workingDayFacts, isWeeklyOff: true, isWorkingDay: false };
// 17-8 leave fixtures — the summary-today shapes the D1 read ships.
const approvedFullDayLeaveFacts: AttendanceTodayFacts = {
  ...workingDayFacts,
  leaveState: 'approved',
  leavePart: 'full_day',
};
const pendingFullDayLeaveFacts: AttendanceTodayFacts = {
  ...workingDayFacts,
  leaveState: 'pending',
  leavePart: 'full_day',
};
// An off-day inside a leave span: the D1 read does NOT filter on
// working-day — leaveState non-null with isWorkingDay false. The HOLIDAY
// dialog owns this shape (the predicates are mutually exclusive).
const offDayInsideLeaveFacts: AttendanceTodayFacts = {
  ...weeklyOffFacts,
  leaveState: 'approved',
  leavePart: 'full_day',
};
const offlineState = {
  type: 'none',
  isConnected: false,
  isInternetReachable: false,
  details: null,
} as never;
const onlineState = {
  type: 'wifi',
  isConnected: true,
  isInternetReachable: true,
  details: null,
} as never;

function checkInResponse() {
  return {
    workDate: '2026-09-29',
    checkinAt: '2026-09-29T10:16:00+05:30',
    lateMinutes: 61,
    isLate: true,
    dayContext: { isWeeklyOff: true, isHoliday: false, holidayName: null, isWorkingDay: false },
  };
}

let probe: ReturnType<typeof useCheckInOut>;
let settled: jest.Mock;
let accessDenied: jest.Mock;

function Probe({ today }: { today: typeof workingDayFacts | null | undefined }) {
  probe = useCheckInOut({ today, onSettled: settled, onAccessDenied: accessDenied });
  return null;
}

function renderProbe(today: typeof workingDayFacts | null | undefined = workingDayFacts) {
  settled = jest.fn();
  accessDenied = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe today={today} />);
  });
  return renderer;
}

/** act-wrapped unmount: the permission probe's promise settles late. */
function unmount(renderer: ReactTestRenderer.ReactTestRenderer) {
  act(() => {
    renderer.unmount();
  });
}

/** The Alert spy's captured buttons array for the last call. */
function dialogButtons(): Array<{ text: string; onPress?: () => void }> {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
  return (call?.[2] ?? []) as Array<{ text: string; onPress?: () => void }>;
}

async function settleDialog(buttonText: string) {
  const button = dialogButtons().find(b => b.text === buttonText);
  await act(async () => {
    button?.onPress?.();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  __resetNetInfoMock();
  capture.mockResolvedValue(FIX);
  resolveState.mockResolvedValue('granted');
  checkIn.mockResolvedValue(checkInResponse());
  checkOut.mockResolvedValue({
    workDate: '2026-09-29',
    checkinAt: '2026-09-29T10:16:00+05:30',
    checkoutAt: '2026-09-29T18:05:00+05:30',
    workedMinutes: 469,
    earlyCheckout: false,
    earlyCheckoutMinutes: null,
    dayContext: { isWeeklyOff: true, isHoliday: false, holidayName: null, isWorkingDay: false },
  });
});

describe('the pre-flight dialog (weekly off / holiday)', () => {
  it('fires BEFORE any GPS work on a weekly-off day, and CANCEL sends NOTHING (AC: no request at all)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(weeklyOffFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "It's a holiday. Check in anyway?",
      undefined,
      expect.any(Array),
    );
    expect(capture).not.toHaveBeenCalled(); // GPS only AFTER the confirm

    await settleDialog('Cancel');

    expect(capture).not.toHaveBeenCalled();
    expect(checkIn).not.toHaveBeenCalled();
    // The latch released — a new tap re-opens the dialog.
    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it('CONFIRM proceeds to capture + submit with one fresh UUID v4 idempotency key', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(weeklyOffFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    await settleDialog('Check in');

    expect(capture).toHaveBeenCalledTimes(1);
    expect(checkIn).toHaveBeenCalledTimes(1);
    const [fix, key] = checkIn.mock.calls[0];
    expect(fix).toEqual(FIX);
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(probe.record).toMatchObject({
      checkinAt: '2026-09-29T10:16:00+05:30',
      checkoutAt: null,
    });
    expect(settled).toHaveBeenCalled();
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it('a second tap while the dialog is up is a NO-OP (one dialog, one request — two keys would burn a real attempt)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(weeklyOffFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    await act(async () => {
      probe.press('check_in'); // double-tap during the dialog
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    await settleDialog('Check in');
    expect(checkIn).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it('a NORMAL working day skips the dialog entirely (no Alert, straight to capture)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(workingDayFacts);

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(checkIn).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it('legacy backend (today undefined) never asks — the server still records the truth', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(undefined);

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(checkIn).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
    unmount(renderer);
  });
});

describe('the full-day-leave pre-flight dialog (17-8 D2/D3/D6)', () => {
  const LEAVE_TITLE =
    "You're on leave today. Checking in will cancel today's leave. Continue?";
  const LEAVE_BODY =
    "Your owner will be notified. Only today's leave is cancelled — your other leave days are not affected.";

  it('fires BEFORE any GPS work on an approved full-day-leave working day; copy + button order are EXACT', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(approvedFullDayLeaveFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    // Title = the PRD-verbatim ask string; body = the one plain-English
    // line; "Don't check in" (style cancel) FIRST, "Check in" second — no
    // destructive, no isPreferred (D6).
    expect(Alert.alert).toHaveBeenCalledWith(LEAVE_TITLE, LEAVE_BODY, [
      { text: "Don't check in", style: 'cancel', onPress: expect.any(Function) },
      { text: 'Check in', onPress: expect.any(Function) },
    ]);
    expect(capture).not.toHaveBeenCalled(); // GPS only AFTER the confirm

    await settleDialog("Don't check in");
    expect(capture).not.toHaveBeenCalled();
    expect(checkIn).not.toHaveBeenCalled();
    // The latch released — a new tap re-opens the dialog (every fresh tap
    // re-runs the gate; a decision is never remembered).
    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    expect(Alert.alert).toHaveBeenCalledTimes(2);
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it('PENDING full-day leave asks too (the copy never says "approved")', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(pendingFullDayLeaveFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    expect(Alert.alert).toHaveBeenCalledWith(LEAVE_TITLE, LEAVE_BODY, expect.any(Array));

    await settleDialog('Check in');
    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(checkIn.mock.calls[0][2]).toBe(true); // confirmLeaveCancel rides
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it('CONFIRM proceeds: capture + submit carrying confirmLeaveCancel: true, normal success', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(approvedFullDayLeaveFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    await settleDialog('Check in');

    expect(capture).toHaveBeenCalledTimes(1);
    const [fix, key, flag] = checkIn.mock.calls[0];
    expect(fix).toEqual(FIX);
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(flag).toBe(true);
    expect(probe.record).toMatchObject({
      checkinAt: '2026-09-29T10:16:00+05:30',
      checkoutAt: null,
    });
    expect(settled).toHaveBeenCalled();
    expect(probe.message).toBeNull();
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it.each(['first_half', 'second_half'] as const)(
    'a %s leave day is strictly NOTHING — no dialog, no subtext, straight to capture, no flag',
    async part => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const renderer = renderProbe({ ...workingDayFacts, leaveState: 'approved', leavePart: part });

      await act(async () => {
        probe.press('check_in');
        await act(async () => {});
      });

      expect(Alert.alert).not.toHaveBeenCalled();
      expect(capture).toHaveBeenCalledTimes(1);
      expect(checkIn).toHaveBeenCalledTimes(1);
      expect(checkIn.mock.calls[0][2]).toBeUndefined(); // the flag never rides
      alertSpy.mockRestore();
      unmount(renderer);
    },
  );

  it('a fresh tap re-runs the gate at TAP time: facts that changed to no-leave never replay the dialog', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(approvedFullDayLeaveFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    await settleDialog("Don't check in");
    expect(Alert.alert).toHaveBeenCalledTimes(1);

    // Leave revoked mid-session; the next refresh has landed.
    await act(async () => {
      renderer.update(<Probe today={workingDayFacts} />);
    });
    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1); // never replayed
    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(checkIn.mock.calls[0][2]).toBeUndefined();
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it('check-OUT is never gated even on a full-day-leave day (FR-9 is check-in only)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(approvedFullDayLeaveFacts);

    await act(async () => {
      probe.press('check_out');
      await act(async () => {});
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(checkOut).toHaveBeenCalledTimes(1);
    expect(checkIn).not.toHaveBeenCalled();
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it('a legacy wire (today present, leaveState ABSENT) never asks and never sends the flag', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    // Simulate the pre-17-8 wire: today carries the 16-4 fields only.
    const legacyFacts = { ...workingDayFacts };
    delete (legacyFacts as Partial<AttendanceTodayFacts>).leaveState;
    delete (legacyFacts as Partial<AttendanceTodayFacts>).leavePart;
    const renderer = renderProbe(legacyFacts);

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(checkIn.mock.calls[0][2]).toBeUndefined();
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it('an OFF DAY inside a leave span surfaces the HOLIDAY dialog, never the leave dialog (mutual exclusivity)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(offDayInsideLeaveFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "It's a holiday. Check in anyway?",
      undefined,
      expect.any(Array),
    );
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    await settleDialog('Cancel');
    expect(checkIn).not.toHaveBeenCalled();
    alertSpy.mockRestore();
    unmount(renderer);
  });
});

describe('the wire-driven 409 fallback (17-8 D4)', () => {
  const LEAVE_TITLE =
    "You're on leave today. Checking in will cancel today's leave. Continue?";
  const LEAVE_BODY =
    "Your owner will be notified. Only today's leave is cancelled — your other leave days are not affected.";
  const SERVER_LINE = 'You have leave today. Confirm to cancel it and check in';
  const leave409 = {
    status: 409,
    code: 'ATTENDANCE_LEAVE_CONFIRMATION_REQUIRED',
    message: SERVER_LINE,
  };

  it('a 409 on a PLAIN working-day tap shows the SAME dialog UNCONDITIONALLY (facts fn not consulted), latch HELD', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(workingDayFacts);
    // The first capture returns FIX1; the retry's FRESH capture returns FIX2.
    const FIX2 = { ...FIX, latitude: 12.98, longitude: 77.6 };
    capture.mockReset();
    capture.mockResolvedValueOnce(FIX).mockResolvedValue(FIX2);
    checkIn.mockRejectedValueOnce(leave409);

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    // The facts said NO leave — the dialog shows anyway (wire-driven).
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith(LEAVE_TITLE, LEAVE_BODY, expect.any(Array));
    expect(probe.message).toBeNull(); // the 409 is not an error message

    // The latch stays HELD: a tap mid-fallback is a no-op — no double dialog.
    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(checkIn).toHaveBeenCalledTimes(1);

    // Continue = full FRESH capture + FRESH idempotency key + the flag.
    const firstKey = checkIn.mock.calls[0][1];
    await settleDialog('Check in');
    expect(capture).toHaveBeenCalledTimes(2);
    expect(checkIn).toHaveBeenCalledTimes(2);
    expect(checkIn.mock.calls[1][0]).toEqual(FIX2); // the SECOND capture's fix
    const secondKey = checkIn.mock.calls[1][1];
    expect(secondKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(secondKey).not.toBe(firstKey);
    expect(checkIn.mock.calls[1][2]).toBe(true);
    expect(settled).toHaveBeenCalled();
    expect(probe.record).toMatchObject({ checkinAt: '2026-09-29T10:16:00+05:30' });
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it('a SECOND 409 (wiring regression) is the generic error, NEVER a re-dialog (loop guard)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(workingDayFacts);
    checkIn.mockRejectedValueOnce(leave409).mockRejectedValueOnce(leave409);

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });
    await settleDialog('Check in'); // the flag-carrying retry — also 409s

    expect(Alert.alert).toHaveBeenCalledTimes(1); // never re-dialoged
    expect(probe.message).toEqual({ tone: 'error', text: SERVER_LINE });
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it('fallback-CANCEL renders NOTHING (the dialog was the communication) and releases the latch without replaying the flag', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(workingDayFacts);
    checkIn.mockRejectedValueOnce(leave409);

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });
    await settleDialog("Don't check in");

    expect(checkIn).toHaveBeenCalledTimes(1); // only the burned first attempt
    expect(probe.message).toBeNull(); // nothing renders

    // The latch released — a fresh tap works and sends NO flag.
    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });
    expect(checkIn).toHaveBeenCalledTimes(2);
    expect(checkIn.mock.calls[1][2]).toBeUndefined();
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it('revoke-staleness: a flag-carrying submit against a leave that is GONE succeeds normally (inert flag, no leave-cancelled outcome)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(approvedFullDayLeaveFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    await settleDialog('Check in'); // facts stale — the owner already revoked

    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(checkIn.mock.calls[0][2]).toBe(true);
    expect(probe.record).toMatchObject({ checkinAt: '2026-09-29T10:16:00+05:30' });
    expect(settled).toHaveBeenCalled();
    expect(probe.message).toBeNull();
    alertSpy.mockRestore();
    unmount(renderer);
  });

  it('the fallback fires on the HOLIDAY-dialog path too (stale off-day facts, server says working day with leave)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(weeklyOffFacts);
    checkIn.mockRejectedValueOnce(leave409);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    await settleDialog('Check in'); // the holiday confirm → submit 409s

    expect(Alert.alert).toHaveBeenCalledTimes(2); // holiday dialog, then the SAME leave dialog
    expect(Alert.alert).toHaveBeenLastCalledWith(LEAVE_TITLE, LEAVE_BODY, expect.any(Array));
    await settleDialog('Check in');
    expect(checkIn).toHaveBeenCalledTimes(2);
    expect(checkIn.mock.calls[1][2]).toBe(true);
    alertSpy.mockRestore();
    unmount(renderer);
  });
});

describe('outcome handling — the wire-code split', () => {
  it('ALREADY_CHECKED_IN is state RECOVERY: forced refetch, never an error message', async () => {
    const renderer = renderProbe(workingDayFacts);
    checkIn.mockRejectedValueOnce({
      status: 409,
      code: 'ATTENDANCE_ALREADY_CHECKED_IN',
      message: 'You have already checked in today',
    });

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(settled).toHaveBeenCalled(); // the recovery refetch
    expect(probe.message).toBeNull();
    unmount(renderer);
  });

  it('DUPLICATE_RESOURCE is NOT recovery — it renders the server message like any conflict', async () => {
    const renderer = renderProbe(workingDayFacts);
    checkIn.mockRejectedValueOnce({
      status: 409,
      code: 'DUPLICATE_RESOURCE',
      message: 'duplicate',
    });

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(settled).not.toHaveBeenCalled();
    expect(probe.message).toMatchObject({ tone: 'error', text: 'duplicate' });
    unmount(renderer);
  });

  it('RATE_LIMITED starts the countdown from the Retry-After award; the message renders', async () => {
    const renderer = renderProbe(workingDayFacts);
    checkIn.mockRejectedValueOnce({
      status: 429,
      code: 'ATTENDANCE_RATE_LIMITED',
      message: 'Too many attempts. Try again in 10 min',
      retryAfterSeconds: 527,
    });
    const before = Date.now();

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(probe.rateLimitedUntil).not.toBeNull();
    const awardedS = Math.round((probe.rateLimitedUntil! - before) / 1000);
    expect(awardedS).toBe(527);
    expect(probe.message).toMatchObject({ text: 'Too many attempts. Try again in 10 min' });
    unmount(renderer);
  });

  it('RATE_LIMITED without the header falls back to the 600 s window (never NaN)', async () => {
    const renderer = renderProbe(workingDayFacts);
    checkIn.mockRejectedValueOnce({
      status: 429,
      code: 'ATTENDANCE_RATE_LIMITED',
      message: 'blocked',
    });
    const before = Date.now();

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    const awardedS = Math.round((probe.rateLimitedUntil! - before) / 1000);
    expect(awardedS).toBe(600);
    unmount(renderer);
  });

  it('NOT_TRACKED triggers the access refresh (the owner disabled mid-session) plus the server message', async () => {
    const renderer = renderProbe(workingDayFacts);
    checkIn.mockRejectedValueOnce({
      status: 403,
      code: 'ATTENDANCE_NOT_TRACKED',
      message: 'Attendance is not active for you yet',
    });

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(accessDenied).toHaveBeenCalled();
    expect(probe.message).toMatchObject({ text: 'Attendance is not active for you yet' });
    unmount(renderer);
  });

  it('a capture timeout renders ITS copy and never submits (timeout ≠ low accuracy)', async () => {
    const renderer = renderProbe(workingDayFacts);
    capture.mockRejectedValueOnce('timeout');

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(checkIn).not.toHaveBeenCalled();
    expect(probe.message).toEqual({
      tone: 'error',
      text: "Couldn't get your location. Move to an open area and try again.",
    });
    unmount(renderer);
  });
});

describe('the check-out merge and the seedRecord freshness contract', () => {
  it('a check-out after a retained check-in KEEPS the late flag (the check-out 201 carries none)', async () => {
    const renderer = renderProbe(workingDayFacts);
    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });
    await act(async () => {
      probe.press('check_out');
      await act(async () => {});
    });

    expect(checkOut).toHaveBeenCalledTimes(1);
    expect(probe.record).toMatchObject({
      checkinAt: '2026-09-29T10:16:00+05:30',
      checkoutAt: '2026-09-29T18:05:00+05:30',
      lateMinutes: 61,
      isLate: true,
      workedMinutes: 469,
    });
    unmount(renderer);
  });

  it('seedRecord ignores undefined (legacy backend) and never overwrites a FRESHER local record', async () => {
    const renderer = renderProbe(workingDayFacts);
    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });
    const local = probe.record;

    // A stale summary refetch arrives with NO record — local wins.
    act(() => {
      probe.seedRecord(null);
    });
    expect(probe.record).toBe(local);

    // Legacy backend: undefined leaves everything alone.
    act(() => {
      probe.seedRecord(undefined);
    });
    expect(probe.record).toBe(local);
    unmount(renderer);
  });

  it('seedRecord adopts a CLOSED summary over an OPEN local (checked out elsewhere — the server is further along)', async () => {
    const renderer = renderProbe(workingDayFacts);
    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    act(() => {
      probe.seedRecord({
        checkinAt: '2026-09-29T08:00:00+05:30',
        checkoutAt: '2026-09-29T17:00:00+05:30',
        lateMinutes: null,
        isLate: false,
        workedMinutes: 540,
        earlyCheckout: true,
        earlyCheckoutMinutes: 60,
      });
    });

    expect(probe.record).toMatchObject({ checkoutAt: '2026-09-29T17:00:00+05:30' });
    unmount(renderer);
  });
});

describe('the offline gate', () => {
  it('offline at tap blocks before ANY capture (NFR-8: detect offline BEFORE the attempt)', async () => {
    const renderer = renderProbe(workingDayFacts);
    __setNetInfoState(offlineState);

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(capture).not.toHaveBeenCalled();
    expect(checkIn).not.toHaveBeenCalled();
    expect(probe.message).toEqual({
      tone: 'error',
      text: "You're offline. Check-in needs a working connection.",
    });

    __setNetInfoState(onlineState);
    unmount(renderer);
  });

  it('offline DURING the dialog re-checks at CONFIRM (a new moment of decision) and still sends nothing', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = renderProbe(weeklyOffFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    // The network dies while the dialog is up.
    __setNetInfoState(offlineState);
    await settleDialog('Check in');

    expect(capture).not.toHaveBeenCalled();
    expect(probe.message).toMatchObject({
      text: "You're offline. Check-in needs a working connection.",
    });

    __setNetInfoState(onlineState);
    alertSpy.mockRestore();
    unmount(renderer);
  });
});
