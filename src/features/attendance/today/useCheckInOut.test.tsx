/**
 * Hook tests for useCheckInOut (Story 16-4, spec D5/D9/D10/D12; 17-8
 * leave branch + wire-driven 409 fallback; 20-1 ports the pre-flight
 * confirmations onto the shared ConfirmDialog) — the flows the unit-pure
 * model cannot prove: the pre-flight round-trip (cancel sends NOTHING),
 * the double-tap latch, the 409 state-recovery split (ALREADY_* recovers,
 * DUPLICATE_RESOURCE does not), the Retry-After countdown, the offline
 * re-check, the check-out merge, and the seedRecord freshness contract.
 *
 * The Probe wires the hook's confirmAsk/settleConfirm pair to the SAME
 * ConfirmDialog rendering PunchSection runs — copy straight from
 * checkInDialogs — so a test presses the dialog exactly as the screen
 * does (settleConfirm is the verdict both dialog buttons route to).
 * NetInfo goes through the root mock's __setNetInfoState seam (plain
 * functions — resetAllMocks-safe). Unmounts are act-wrapped: the
 * mount-time permission probe resolves a promise that lands after the
 * last await.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
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
import { ConfirmDialog } from '../../../components/ui';
import { HOLIDAY_DIALOG, LEAVE_DIALOG } from './checkInDialogs';
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
// confirmation owns this shape (the predicates are mutually exclusive).
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
  // The view's exact dialog wiring (20-1): one ConfirmDialog driven by the
  // hook's confirmAsk, verdicts via settleConfirm.
  const confirmDialog =
    probe.confirmAsk === 'leave'
      ? LEAVE_DIALOG
      : probe.confirmAsk === 'holiday'
        ? HOLIDAY_DIALOG
        : null;
  if (confirmDialog == null) return null;
  return (
    <ConfirmDialog
      visible
      title={confirmDialog.title}
      message={confirmDialog.message}
      confirmLabel={confirmDialog.confirmLabel}
      cancelLabel={confirmDialog.cancelLabel}
      onConfirm={() => probe.settleConfirm(true)}
      onCancel={() => probe.settleConfirm(false)}
    />
  );
}

function renderProbe(today: typeof workingDayFacts | null | undefined = workingDayFacts) {
  settled = jest.fn();
  accessDenied = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Probe today={today} />);
  });
  mountedRenderers.push(renderer);
  return renderer;
}

/** act-wrapped unmount: the permission probe's promise settles late. */
function unmount(renderer: ReactTestRenderer.ReactTestRenderer) {
  act(() => {
    renderer.unmount();
  });
}

const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of mountedRenderers.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
});

/** The rendered ConfirmDialog — throws when no confirmation is up. */
function renderedDialog(root: ReactTestRenderer.ReactTestRenderer['root']) {
  const instances = root.findAllByType(ConfirmDialog);
  if (instances.length === 0) throw new Error('no confirmation dialog is up');
  return instances[instances.length - 1];
}

/** Verdict press — same one-shot semantic the real buttons give:
 *  settleConfirm resolves the awaiting continuation exactly once. */
async function settleDialog(
  root: ReactTestRenderer.ReactTestRenderer['root'],
  verdict: 'confirm' | 'cancel',
) {
  const dialog = renderedDialog(root);
  await act(async () => {
    if (verdict === 'confirm') dialog.props.onConfirm();
    else dialog.props.onCancel();
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

describe('the pre-flight confirmation (weekly off / holiday)', () => {
  it('presents the ConfirmDialog BEFORE any GPS work on a weekly-off day, and CANCEL sends NOTHING (AC: no request at all)', async () => {
    const renderer = renderProbe(weeklyOffFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    const dialog = renderedDialog(renderer.root);
    expect(dialog.props.title).toBe(HOLIDAY_DIALOG.title);
    expect(dialog.props.confirmLabel).toBe('Check in');
    expect(dialog.props.cancelLabel).toBe('Cancel');
    expect(capture).not.toHaveBeenCalled(); // GPS only AFTER the confirm

    await settleDialog(renderer.root, 'cancel');

    expect(capture).not.toHaveBeenCalled();
    expect(checkIn).not.toHaveBeenCalled();
    // The dialog is down and the latch released — a new tap re-presents it.
    expect(renderer.root.findAllByType(ConfirmDialog)).toHaveLength(0);
    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    renderedDialog(renderer.root); // throws if not re-presented
    unmount(renderer);
  });

  it('CONFIRM proceeds to capture + submit with one fresh UUID v4 idempotency key', async () => {
    const renderer = renderProbe(weeklyOffFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    await settleDialog(renderer.root, 'confirm');

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
    unmount(renderer);
  });

  it('a second tap while the confirmation is up is a NO-OP (one dialog, one request — two keys would burn a real attempt)', async () => {
    const renderer = renderProbe(weeklyOffFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    expect(probe.dialogPending).toBe(true); // the latch is UP
    await act(async () => {
      probe.press('check_in'); // double-tap during the confirmation
      await Promise.resolve();
    });

    await settleDialog(renderer.root, 'confirm');
    expect(checkIn).toHaveBeenCalledTimes(1);
    unmount(renderer);
  });

  it('a NORMAL working day skips the confirmation entirely (straight to capture)', async () => {
    const renderer = renderProbe(workingDayFacts);

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(renderer.root.findAllByType(ConfirmDialog)).toHaveLength(0);
    expect(checkIn).toHaveBeenCalledTimes(1);
    unmount(renderer);
  });

  it('legacy backend (today undefined) never asks — the server still records the truth', async () => {
    const renderer = renderProbe(undefined);

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(renderer.root.findAllByType(ConfirmDialog)).toHaveLength(0);
    expect(checkIn).toHaveBeenCalledTimes(1);
    unmount(renderer);
  });
});

describe('the full-day-leave pre-flight (17-8 D2/D3/D6, ported 20-1)', () => {
  const LEAVE_TITLE =
    "You're on leave today. Checking in will cancel today's leave. Continue?";
  const LEAVE_BODY =
    "Your owner will be notified. Only today's leave is cancelled — your other leave days are not affected.";

  it('presents BEFORE any GPS work on an approved full-day-leave working day; copy + button vocabulary are EXACT', async () => {
    const renderer = renderProbe(approvedFullDayLeaveFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    // Title = the PRD-verbatim ask string; body = the one plain-English
    // line; "Don't check in" stays the safe secondary, "Check in" the
    // primary — never a destructive/danger confirm (D6).
    const dialog = renderedDialog(renderer.root);
    expect(dialog.props.title).toBe(LEAVE_TITLE);
    expect(dialog.props.message).toBe(LEAVE_BODY);
    expect(dialog.props.confirmLabel).toBe('Check in');
    expect(dialog.props.cancelLabel).toBe("Don't check in");
    expect(capture).not.toHaveBeenCalled(); // GPS only AFTER the confirm

    await settleDialog(renderer.root, 'cancel');
    expect(capture).not.toHaveBeenCalled();
    expect(checkIn).not.toHaveBeenCalled();
    // The latch released — a new tap re-presents (every fresh tap re-runs
    // the gate; a decision is never remembered).
    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    renderedDialog(renderer.root);
    unmount(renderer);
  });

  it('PENDING full-day leave asks too (the copy never says "approved")', async () => {
    const renderer = renderProbe(pendingFullDayLeaveFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    const dialog = renderedDialog(renderer.root);
    expect(dialog.props.title).toBe(LEAVE_TITLE);
    expect(dialog.props.message).toBe(LEAVE_BODY);
    expect(String(dialog.props.message).toLowerCase()).not.toContain('approved');

    await settleDialog(renderer.root, 'confirm');
    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(checkIn.mock.calls[0][2]).toBe(true); // confirmLeaveCancel rides
    unmount(renderer);
  });

  it('CONFIRM proceeds: capture + submit carrying confirmLeaveCancel: true, normal success', async () => {
    const renderer = renderProbe(approvedFullDayLeaveFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    await settleDialog(renderer.root, 'confirm');

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
    unmount(renderer);
  });

  it.each(['first_half', 'second_half'] as const)(
    'a %s leave day is strictly NOTHING — no confirmation, straight to capture, no flag',
    async part => {
      const renderer = renderProbe({ ...workingDayFacts, leaveState: 'approved', leavePart: part });

      await act(async () => {
        probe.press('check_in');
        await act(async () => {});
      });

      expect(renderer.root.findAllByType(ConfirmDialog)).toHaveLength(0);
      expect(capture).toHaveBeenCalledTimes(1);
      expect(checkIn).toHaveBeenCalledTimes(1);
      expect(checkIn.mock.calls[0][2]).toBeUndefined(); // the flag never rides
      unmount(renderer);
    },
  );

  it('a fresh tap re-runs the gate at TAP time: facts that changed to no-leave never replay the confirmation', async () => {
    const renderer = renderProbe(approvedFullDayLeaveFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    await settleDialog(renderer.root, 'cancel');
    expect(renderer.root.findAllByType(ConfirmDialog)).toHaveLength(0);

    // Leave revoked mid-session; the next refresh has landed.
    await act(async () => {
      renderer.update(<Probe today={workingDayFacts} />);
    });
    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(checkIn.mock.calls[0][2]).toBeUndefined();
    unmount(renderer);
  });

  it('check-OUT is never gated even on a full-day-leave day (FR-9 is check-in only)', async () => {
    const renderer = renderProbe(approvedFullDayLeaveFacts);

    await act(async () => {
      probe.press('check_out');
      await act(async () => {});
    });

    expect(renderer.root.findAllByType(ConfirmDialog)).toHaveLength(0);
    expect(checkOut).toHaveBeenCalledTimes(1);
    expect(checkIn).not.toHaveBeenCalled();
    unmount(renderer);
  });

  it('a legacy wire (today present, leaveState ABSENT) never asks and never sends the flag', async () => {
    // Simulate the pre-17-8 wire: today carries the 16-4 fields only.
    const legacyFacts = { ...workingDayFacts };
    delete (legacyFacts as Partial<AttendanceTodayFacts>).leaveState;
    delete (legacyFacts as Partial<AttendanceTodayFacts>).leavePart;
    const renderer = renderProbe(legacyFacts);

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });

    expect(renderer.root.findAllByType(ConfirmDialog)).toHaveLength(0);
    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(checkIn.mock.calls[0][2]).toBeUndefined();
    unmount(renderer);
  });

  it('an OFF DAY inside a leave span surfaces the HOLIDAY confirmation, never the leave one (mutual exclusivity)', async () => {
    const renderer = renderProbe(offDayInsideLeaveFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });

    const dialog = renderedDialog(renderer.root);
    expect(dialog.props.title).toBe(HOLIDAY_DIALOG.title);
    expect(dialog.props.confirmLabel).toBe('Check in');
    expect(dialog.props.cancelLabel).toBe('Cancel');
    await settleDialog(renderer.root, 'cancel');
    expect(checkIn).not.toHaveBeenCalled();
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

  it('a 409 on a PLAIN working-day tap presents the SAME confirmation UNCONDITIONALLY (facts fn not consulted), latch HELD', async () => {
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

    // The facts said NO leave — the confirmation shows anyway (wire-driven).
    const dialog = renderedDialog(renderer.root);
    expect(dialog.props.title).toBe(LEAVE_TITLE);
    expect(dialog.props.message).toBe(LEAVE_BODY);
    expect(probe.message).toBeNull(); // the 409 is not an error message

    // The latch stays HELD: a tap mid-fallback is a no-op — no double dialog.
    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    expect(renderer.root.findAllByType(ConfirmDialog)).toHaveLength(1);
    expect(checkIn).toHaveBeenCalledTimes(1);

    // Continue = full FRESH capture + FRESH idempotency key + the flag.
    const firstKey = checkIn.mock.calls[0][1];
    await settleDialog(renderer.root, 'confirm');
    expect(capture).toHaveBeenCalledTimes(2);
    expect(checkIn).toHaveBeenCalledTimes(2);
    expect(checkIn.mock.calls[1][0]).toEqual(FIX2); // the SECOND capture's fix
    const secondKey = checkIn.mock.calls[1][1];
    expect(secondKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(secondKey).not.toBe(firstKey);
    expect(checkIn.mock.calls[1][2]).toBe(true);
    expect(settled).toHaveBeenCalled();
    expect(probe.record).toMatchObject({ checkinAt: '2026-09-29T10:16:00+05:30' });
    unmount(renderer);
  });

  it('a SECOND 409 (wiring regression) is the generic error, NEVER a re-presentation (loop guard)', async () => {
    const renderer = renderProbe(workingDayFacts);
    checkIn.mockRejectedValueOnce(leave409).mockRejectedValueOnce(leave409);

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });
    await settleDialog(renderer.root, 'confirm'); // the flag-carrying retry — also 409s

    expect(renderer.root.findAllByType(ConfirmDialog)).toHaveLength(0); // never re-presented
    expect(probe.message).toEqual({ tone: 'error', text: SERVER_LINE });
    unmount(renderer);
  });

  it('fallback-CANCEL renders NOTHING (the dialog was the communication) and releases the latch without replaying the flag', async () => {
    const renderer = renderProbe(workingDayFacts);
    checkIn.mockRejectedValueOnce(leave409);

    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });
    await settleDialog(renderer.root, 'cancel');

    expect(checkIn).toHaveBeenCalledTimes(1); // only the burned first attempt
    expect(probe.message).toBeNull(); // nothing renders
    expect(renderer.root.findAllByType(ConfirmDialog)).toHaveLength(0);

    // The latch released — a fresh tap works and sends NO flag.
    await act(async () => {
      probe.press('check_in');
      await act(async () => {});
    });
    expect(checkIn).toHaveBeenCalledTimes(2);
    expect(checkIn.mock.calls[1][2]).toBeUndefined();
    unmount(renderer);
  });

  it('revoke-staleness: a flag-carrying submit against a leave that is GONE succeeds normally (inert flag, no leave-cancelled outcome)', async () => {
    const renderer = renderProbe(approvedFullDayLeaveFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    await settleDialog(renderer.root, 'confirm'); // facts stale — the owner already revoked

    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(checkIn.mock.calls[0][2]).toBe(true);
    expect(probe.record).toMatchObject({ checkinAt: '2026-09-29T10:16:00+05:30' });
    expect(settled).toHaveBeenCalled();
    expect(probe.message).toBeNull();
    unmount(renderer);
  });

  it('the fallback fires on the HOLIDAY path too (stale off-day facts, server says working day with leave)', async () => {
    const renderer = renderProbe(weeklyOffFacts);
    checkIn.mockRejectedValueOnce(leave409);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    const holidayDialog = renderedDialog(renderer.root); // the holiday confirmation is up
    expect(holidayDialog.props.title).toBe(HOLIDAY_DIALOG.title);
    expect(probe.confirmAsk).toBe('holiday');
    await settleDialog(renderer.root, 'confirm'); // → submit 409s

    // The SAME leave confirmation now presents (second dialog, same wiring).
    const leaveDialog = renderedDialog(renderer.root);
    expect(leaveDialog.props.title).toBe(LEAVE_TITLE);
    expect(probe.confirmAsk).toBe('leave');
    await settleDialog(renderer.root, 'confirm');
    expect(checkIn).toHaveBeenCalledTimes(2);
    expect(checkIn.mock.calls[1][2]).toBe(true);
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

  it('offline DURING the confirmation re-checks at CONFIRM (a new moment of decision) and still sends nothing', async () => {
    const renderer = renderProbe(weeklyOffFacts);

    await act(async () => {
      probe.press('check_in');
      await Promise.resolve();
    });
    // The network dies while the confirmation is up.
    __setNetInfoState(offlineState);
    await settleDialog(renderer.root, 'confirm');

    expect(capture).not.toHaveBeenCalled();
    expect(probe.message).toMatchObject({
      text: "You're offline. Check-in needs a working connection.",
    });

    __setNetInfoState(onlineState);
    unmount(renderer);
  });
});