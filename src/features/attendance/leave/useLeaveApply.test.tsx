/**
 * Hook tests for `useLeaveApply` (Story 17-5, spec §4). The services
 * barrel and the access store are mocked; the picker return channel is
 * driven the way the screen really receives it — route params merged by
 * the DatePicker's popTo. Pins: preview fires only when From exists; the
 * MONOTONIC-SEQ race latch (a stale response after a newer request is
 * dropped, incl. the param-repeat A→B→A case); ok:false → inline
 * rejection with NOT_TRACKED forcing the access refresh; transport →
 * neutral notice with submit still enabled; the submit gate + the five
 * rejections firing inline with dates+reason present; one fresh
 * idempotency key per tap; double-tap no-op; replay-201 = success
 * (announce → goBack); the access flip pop-back; unmount mid-flight safe;
 * read-once-then-clear param consumption.
 */
jest.mock('../../../services', () => ({
  attendanceLeaveService: {
    previewLeave: jest.fn(),
    applyLeave: jest.fn(),
  },
}));

jest.mock('../me/attendanceAccessStore', () => ({
  useAttendanceAccess: jest.fn(),
  refreshAttendanceAccessNow: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';
import { attendanceLeaveService } from '../../../services';
import type { LeavePreview, LeaveRequestView } from '../../../services/resources/attendanceLeave';
import type { ApiError } from '../../../services/api/apiError';
import {
  refreshAttendanceAccessNow,
  useAttendanceAccess,
} from '../me/attendanceAccessStore';
import type { AttendanceAccessStateSnapshot } from '../me/attendanceAccessStore';
import type { LeaveApplyParams } from '../../../navigation/types';
import {
  PREVIEW_TRANSPORT_MESSAGE,
  SUBMITTED_ANNOUNCEMENT,
  useLeaveApply,
} from './useLeaveApply';

const previewLeave = attendanceLeaveService.previewLeave as jest.Mock;
const applyLeave = attendanceLeaveService.applyLeave as jest.Mock;
const refreshAccessNow = refreshAttendanceAccessNow as jest.Mock;
const useAttendanceAccessMock = useAttendanceAccess as jest.Mock;

function ready(
  attendanceAccess: 'active' | 'upcoming' | 'none' | 'history_only',
): AttendanceAccessStateSnapshot {
  return {
    status: 'ready',
    access: {
      attendanceEnabled: true,
      attendanceAccess,
      attendanceStartDate: null,
      attendanceEndedOn: null,
      enabledAt: '2026-09-28T10:00:00Z',
      onboardedAt: '2026-09-28T09:00:00Z',
      officeId: 'o1',
      officeName: 'HQ',
    },
  };
}

type Nav = {
  navigate: jest.Mock;
  goBack: jest.Mock;
  setParams: jest.Mock;
  isFocused: jest.Mock;
  addListener: jest.Mock;
};

function makeNavigation(): Nav {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setParams: jest.fn(),
    isFocused: jest.fn(() => true),
    addListener: jest.fn(() => jest.fn()),
  };
}

type Hook = ReturnType<typeof useLeaveApply>;
let latest: Hook;

type Route = { params?: LeaveApplyParams };
type HookInput = Parameters<typeof useLeaveApply>[0];
type HookNavigation = HookInput['navigation'];

function Probe({ navigation, route }: HookInput) {
  latest = useLeaveApply({ navigation, route });
  return null;
}

type Ctx = {
  navigation: Nav;
  renderer: ReactTestRenderer.ReactTestRenderer;
  /** Re-renders with new picker-return params (the popTo merge). */
  pick: (pickedDate: string, context: 'from' | 'to') => void;
  rerender: (route: Route) => void;
};

function render(route: Route = {}, store: AttendanceAccessStateSnapshot = ready('active')): Ctx {
  const navigation = makeNavigation();
  useAttendanceAccessMock.mockReturnValue(store);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const element = (r: Route, n: Nav) => (
    <Probe navigation={n as unknown as HookNavigation} route={r} />
  );
  act(() => {
    renderer = create(element(route, navigation));
  });
  return {
    navigation,
    renderer,
    pick(pickedDate, context) {
      this.rerender({ params: { today: null, pickedDate, context } });
    },
    rerender(next: Route) {
      act(() => {
        renderer.update(element(next, navigation));
      });
    },
  };
}

/** Flushes the microtask chain inside act (the useAttendanceSummary shape). */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 6; i++) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function previewOk(workingDays: number): LeavePreview {
  return { ok: true, workingDays, totalDays: workingDays, part: 'full_day', dates: [] };
}

function previewReject(errorCode: string, message: string): LeavePreview {
  return { ok: false, errorCode, message } as LeavePreview;
}

function apiError(code: string, message: string, status = 422): ApiError {
  return { status, code, message };
}

const REQUEST_VIEW: LeaveRequestView = {
  id: 'r1',
  employeeId: 'e1',
  startDate: '2026-10-05',
  endDate: '2026-10-05',
  part: 'full_day',
  reason: 'Family event',
  status: 'pending',
  workingDays: 1,
  totalDays: 1,
  createdBy: 'e1',
  createdAt: '2026-09-29T06:00:00.000Z',
  dates: [{ date: '2026-10-05', state: 'pending' }],
};

beforeEach(() => {
  jest.resetAllMocks();
  useAttendanceAccessMock.mockReturnValue(ready('active'));
  // Quiet defaults — mockResolvedValueOnce overrides these per scenario.
  previewLeave.mockResolvedValue(previewOk(1));
  applyLeave.mockResolvedValue(REQUEST_VIEW);
  jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined);
});

describe('the live preview (D4)', () => {
  it('does not fire without From; fires with the normalized single-date query once From lands', async () => {
    const ctx = render();
    expect(previewLeave).not.toHaveBeenCalled();
    expect(latest.preview.status).toBe('idle');

    ctx.pick('2026-10-05', 'from');
    expect(latest.from).toBe('2026-10-05');
    expect(previewLeave).toHaveBeenCalledTimes(1);
    expect(previewLeave).toHaveBeenLastCalledWith({ startDate: '2026-10-05' });

    await settle();
    expect(latest.preview).toEqual({ status: 'ok', workingDays: 1, message: null });
  });

  it('omits endDate only for a single date; a range carries it', async () => {
    previewLeave.mockResolvedValue(previewOk(3));
    const ctx = render();
    ctx.pick('2026-10-05', 'from');
    ctx.pick('2026-10-09', 'to');
    expect(previewLeave).toHaveBeenLastCalledWith({
      startDate: '2026-10-05',
      endDate: '2026-10-09',
    });
    await settle();
  });

  it('the seq latch drops a stale response, including the A→B→A param repeat', async () => {
    const first = deferred<LeavePreview>();
    previewLeave.mockReturnValueOnce(first.promise);
    const ctx = render({ params: { today: null, pickedDate: '2026-10-05', context: 'from' } });

    const second = deferred<LeavePreview>();
    previewLeave.mockReturnValueOnce(second.promise);
    ctx.pick('2026-10-08', 'from');

    second.resolve(previewOk(3));
    await settle();
    expect(latest.preview).toEqual({ status: 'ok', workingDays: 3, message: null });

    // From-A again: a NEWEST request, while the first A's response is still
    // in flight — the param-key dedupe could never tell these apart.
    const third = deferred<LeavePreview>();
    previewLeave.mockReturnValueOnce(third.promise);
    ctx.pick('2026-10-05', 'from');

    first.resolve(previewOk(99)); // stale seq — must be dropped
    await settle();
    // The newest request is still in flight: the previous value dims in
    // place (status loading, D2) — never the stale 99.
    expect(latest.preview).toEqual({ status: 'loading', workingDays: 3, message: null });

    third.resolve(previewOk(5));
    await settle();
    expect(latest.preview).toEqual({ status: 'ok', workingDays: 5, message: null });
    expect(latest.preview.workingDays).not.toBe(99);
  });

  it('ok:false renders the server message inline; NOT_TRACKED alone forces the access refresh', async () => {
    previewLeave.mockResolvedValueOnce(
      previewReject('LEAVE_OVERLAP', 'You already have a leave request covering one of these dates'),
    );
    const ctx = render();
    ctx.pick('2026-10-05', 'from');
    await settle();
    expect(latest.preview).toEqual({
      status: 'rejected',
      workingDays: null,
      message: 'You already have a leave request covering one of these dates',
    });
    expect(refreshAccessNow).not.toHaveBeenCalled();

    previewLeave.mockResolvedValueOnce(
      previewReject('ATTENDANCE_NOT_TRACKED', 'Attendance is not tracked for you'),
    );
    ctx.pick('2026-10-06', 'from');
    await settle();
    expect(latest.preview.status).toBe('rejected');
    expect(refreshAccessNow).toHaveBeenCalledTimes(1);
  });

  it('a transport failure renders the neutral line and submit stays enabled', async () => {
    previewLeave.mockRejectedValueOnce(new Error('offline'));
    const ctx = render();
    ctx.pick('2026-10-05', 'from');
    await settle();
    expect(latest.preview).toEqual({
      status: 'transport',
      workingDays: null,
      message: PREVIEW_TRANSPORT_MESSAGE,
    });
    act(() => { latest.setReason('Family event'); });
    expect(latest.canSubmit).toBe(true);
  });
});

describe('submit (D5)', () => {
  function readyWithFrom(): Ctx {
    previewLeave.mockResolvedValue(previewOk(1));
    const ctx = render();
    ctx.pick('2026-10-05', 'from');
    return ctx;
  }

  it('is gated on From AND a non-blank reason (whitespace-only stays disabled)', () => {
    const ctx = render();
    act(() => { latest.setReason('   '); });
    expect(latest.canSubmit).toBe(false);
    ctx.pick('2026-10-05', 'from');
    expect(latest.canSubmit).toBe(false);
    act(() => { latest.setReason('Family event'); });
    expect(latest.canSubmit).toBe(true);
  });

  it('the five rejections fire inline with dates+reason present; submit never pre-disables', async () => {
    const cases: [string, string][] = [
      ['LEAVE_INVALID_RANGE', 'These dates are more than two months apart'],
      ['LEAVE_TOO_OLD', 'You can only apply for leave up to 7 days in the past'],
      ['LEAVE_BEFORE_START_DATE', 'You can only apply for leave from 2026-11-01 onward'],
      ['LEAVE_ALREADY_OFF', 'These days are already off'],
      ['LEAVE_CHECKED_IN_CONFLICT', "You already checked in on 2026-10-05, so it can't be requested as leave"],
      ['LEAVE_OVERLAP', 'You already have a leave request covering one of these dates'],
    ];
    for (const [code, message] of cases) {
      const ctx = readyWithFrom();
      act(() => { latest.setReason('Family event'); });
      applyLeave.mockRejectedValueOnce(apiError(code, message, code === 'LEAVE_OVERLAP' ? 409 : 422));
      ctx.pick('2026-10-99', 'to'); // a param change to prove the message then sticks
      act(() => { latest.submit(); });
      await settle();
      expect(latest.footerError).toBe(message);
      expect(latest.canSubmit).toBe(true); // rejections never pre-disable (D4)
      expect(latest.submitting).toBe(false);
    }
  });

  it('mints a FRESH idempotency key per tap and no-ops a double-tap mid-flight', async () => {
    const ctx = readyWithFrom();
    act(() => { latest.setReason('Family event'); });
    const pending = deferred<LeaveRequestView>();
    applyLeave.mockReturnValueOnce(pending.promise);

    act(() => { latest.submit(); });
    latest.submit(); // the in-flight latch: still exactly one POST
    expect(applyLeave).toHaveBeenCalledTimes(1);
    expect(applyLeave).toHaveBeenCalledWith(
      { startDate: '2026-10-05', reason: 'Family event' },
      expect.any(String),
    );
    expect(latest.submitting).toBe(true);

    pending.resolve(REQUEST_VIEW);
    await settle();
    expect(latest.submitting).toBe(false);

    latest.submit(); // a second tap is a NEW action with a NEW key
    await settle();
    expect(applyLeave).toHaveBeenCalledTimes(2);
    const keys = applyLeave.mock.calls.map(call => call[1]);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('201 = success for create AND replay alike: announce, then goBack', async () => {
    const ctx = readyWithFrom();
    act(() => { latest.setReason('Family event'); });
    applyLeave.mockResolvedValueOnce(REQUEST_VIEW); // a replay answers the stored view, same 201
    act(() => { latest.submit(); });
    await settle();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      SUBMITTED_ANNOUNCEMENT,
    );
    expect(ctx.navigation.goBack).toHaveBeenCalledTimes(1);
    expect(latest.footerError).toBeNull();
  });

  it('the offline code renders the FE line; NOT_TRACKED also forces the access refresh', async () => {
    const ctx = readyWithFrom();
    act(() => { latest.setReason('Family event'); });
    applyLeave.mockRejectedValueOnce(
      apiError('NETWORK_ERROR', 'Could not reach the server.', 0),
    );
    act(() => { latest.submit(); });
    await settle();
    expect(latest.footerError).toBe("You're offline. Submitting leave needs a working connection.");
    expect(refreshAccessNow).not.toHaveBeenCalled();

    applyLeave.mockRejectedValueOnce(
      apiError('ATTENDANCE_NOT_TRACKED', 'Attendance is not tracked for you', 403),
    );
    act(() => { latest.submit(); });
    await settle();
    expect(refreshAccessNow).toHaveBeenCalledTimes(1);
    expect(latest.footerError).toBe('Attendance is not tracked for you');
  });

  it('a failure announces its message; a message-area change clears it', async () => {
    const ctx = readyWithFrom();
    act(() => { latest.setReason('Family event'); });
    applyLeave.mockRejectedValueOnce(apiError('LEAVE_ALREADY_OFF', 'These days are already off'));
    act(() => { latest.submit(); });
    await settle();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'These days are already off',
    );
    act(() => { latest.setReason('Family event '); }); // the next param change clears the area
    expect(latest.footerError).toBeNull();
  });

  it('unmount mid-flight is safe: no announce, no goBack, the write stands', async () => {
    previewLeave.mockResolvedValue(previewOk(1));
    const ctx = render();
    ctx.pick('2026-10-05', 'from');
    act(() => { latest.setReason('Family event'); });
    const pending = deferred<LeaveRequestView>();
    applyLeave.mockReturnValueOnce(pending.promise);
    act(() => { latest.submit(); });
    act(() => {
      ctx.renderer.unmount();
    });
    pending.resolve(REQUEST_VIEW);
    await settle();
    expect(ctx.navigation.goBack).not.toHaveBeenCalled();
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });
});

describe('the picker return channel (D1)', () => {
  it('consumes read-once-then-clears: setParams null-out, no stale re-dispatch', async () => {
    previewLeave.mockResolvedValue(previewOk(1));
    const ctx = render({ params: { today: null, pickedDate: '2026-10-05', context: 'from' } });
    expect(ctx.navigation.setParams).toHaveBeenCalledWith({ pickedDate: null, context: null });
    expect(latest.from).toBe('2026-10-05');

    // The clearing setParams is async — a re-render with the SAME stale
    // signature must not re-dispatch (the RosterScreen processed-signature
    // guard). One preview GET from the first dispatch only.
    await settle();
    ctx.rerender({ params: { today: null, pickedDate: '2026-10-05', context: 'from' } });
    await settle();
    expect(previewLeave).toHaveBeenCalledTimes(1);
  });

  it('routes the pick by context: from vs to', () => {
    previewLeave.mockResolvedValue(previewOk(1));
    const ctx = render({ params: { today: '2026-10-01', pickedDate: '2026-10-05', context: 'from' } });
    ctx.pick('2026-10-09', 'to');
    expect(latest.from).toBe('2026-10-05');
    expect(latest.to).toBe('2026-10-09');
  });

  it('re-picking the SAME date after a Clear applies — the guard resets when the params clear lands', async () => {
    // Review regression (blind-hunter MEDIUM): Clear makes same-value
    // repeats a legitimate action; the old never-resetting signature
    // guard swallowed the second pick.
    previewLeave.mockResolvedValue(previewOk(1));
    const ctx = render({ params: { today: '2026-10-01', pickedDate: null, context: null } });
    ctx.pick('2026-10-05', 'from');
    ctx.pick('2026-10-09', 'to');
    expect(latest.to).toBe('2026-10-09');

    act(() => { latest.clearTo(); });
    expect(latest.to).toBeNull();

    // The clearing setParams lands → the signature guard resets → the
    // SAME date must now apply again.
    ctx.rerender({ params: { today: '2026-10-01', pickedDate: null, context: null } });
    ctx.pick('2026-10-09', 'to');
    expect(latest.to).toBe('2026-10-09');
  });
});

describe('the picker navigation and the today−7 floor (D2/D9)', () => {
  it('From opens with the simple title and the today−7 min; upcoming passes no today', () => {
    const ctx = render({ params: { today: '2026-10-01', pickedDate: null, context: null } });
    latest.openFromPicker();
    expect(ctx.navigation.navigate).toHaveBeenCalledWith('DatePicker', {
      title: 'Choose start date',
      value: null,
      today: '2026-10-01',
      minDate: '2026-09-24',
      returnTo: 'LeaveApply',
      context: 'from',
    });
  });

  it('upcoming (today null) passes no today and no min — the server floor answers inline', () => {
    const ctx = render({ params: { today: null } });
    latest.openFromPicker();
    expect(ctx.navigation.navigate).toHaveBeenCalledWith('DatePicker', {
      title: 'Choose start date',
      value: null,
      today: undefined,
      minDate: undefined,
      returnTo: 'LeaveApply',
      context: 'from',
    });
  });

  it('To opens with its own title and min = From', () => {
    previewLeave.mockResolvedValue(previewOk(1));
    const ctx = render({ params: { today: '2026-10-01', pickedDate: '2026-10-05', context: 'from' } });
    latest.openToPicker();
    expect(ctx.navigation.navigate).toHaveBeenCalledWith('DatePicker', {
      title: 'Choose end date',
      value: null,
      today: '2026-10-01',
      minDate: '2026-10-05',
      returnTo: 'LeaveApply',
      context: 'to',
    });
  });
});

describe('the access-flip pop-back (D1)', () => {
  it('a flip to none while this screen is on top pops back to the tab', () => {
    const ctx = render({}, ready('active'));
    expect(ctx.navigation.goBack).not.toHaveBeenCalled();
    useAttendanceAccessMock.mockReturnValue(ready('none'));
    ctx.rerender({ params: { today: null } });
    expect(ctx.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('history_only pops back too', () => {
    const ctx = render({}, ready('active'));
    useAttendanceAccessMock.mockReturnValue(ready('history_only'));
    ctx.rerender({ params: { today: null } });
    expect(ctx.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('a flip while NOT focused does not navigate', () => {
    const ctx = render({}, ready('active'));
    ctx.navigation.isFocused.mockReturnValue(false);
    useAttendanceAccessMock.mockReturnValue(ready('none'));
    ctx.rerender({ params: { today: null } });
    expect(ctx.navigation.goBack).not.toHaveBeenCalled();
  });

  it('a flip landing while NOT focused is re-checked when the form regains focus', () => {
    // Review regression (blind-hunter MEDIUM): the flip arriving while the
    // DatePicker is on top skips the effect; returning from the picker must
    // re-check, or the user stays on an interactive form over a disabled
    // attendance system.
    const ctx = render({}, ready('active'));
    ctx.navigation.isFocused.mockReturnValue(false);
    useAttendanceAccessMock.mockReturnValue(ready('none'));
    ctx.rerender({ params: { today: null } });
    expect(ctx.navigation.goBack).not.toHaveBeenCalled();

    ctx.navigation.isFocused.mockReturnValue(true); // the popTo refocuses us
    const focusCalls = ctx.navigation.addListener.mock.calls.filter(
      ([event]) => event === 'focus',
    );
    expect(focusCalls.length).toBeGreaterThan(0);
    // The LATEST registration closes over the 'none' snapshot (each access
    // change re-registers); invoking it is the popTo refocus moment.
    act(() => { (focusCalls[focusCalls.length - 1][1] as () => void)(); });
    expect(ctx.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('never pops on first sight of none (the eligible latch starts closed)', () => {
    const ctx = render({}, ready('none'));
    expect(ctx.navigation.goBack).not.toHaveBeenCalled();
  });
});
