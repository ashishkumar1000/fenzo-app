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

const workingDayFacts = {
  date: '2026-09-29',
  isWeeklyOff: false,
  isHoliday: false,
  holidayName: null,
  isWorkingDay: true,
};
const weeklyOffFacts = { ...workingDayFacts, isWeeklyOff: true, isWorkingDay: false };
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

async function settleDialog(buttonText: 'Cancel' | 'Check in') {
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
