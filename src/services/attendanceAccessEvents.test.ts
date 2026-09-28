/**
 * Tests for the neutral attendance/notifications seam (Story 15-10): the
 * one-registrant refetch callback (a later registration REPLACES the
 * earlier one; unregistering a STALE handle must not clobber the current
 * registrant), the reachability flag the notifications screen's tap guard
 * reads, the `attendance.*` prefix vocabulary, and the 401 reset.
 */
import {
  emitAttendanceAccessRefresh,
  isAttendanceEventType,
  isAttendanceReachable,
  registerAttendanceAccessRefresh,
  resetAttendanceAccessEvents,
  setAttendanceReachable,
} from './attendanceAccessEvents';

beforeEach(() => {
  resetAttendanceAccessEvents();
});

describe('registerAttendanceAccessRefresh / emitAttendanceAccessRefresh', () => {
  it('emit invokes the registered listener', () => {
    const listener = jest.fn();
    registerAttendanceAccessRefresh(listener);

    emitAttendanceAccessRefresh();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unregistering stops the invocation', () => {
    const listener = jest.fn();
    const unregister = registerAttendanceAccessRefresh(listener);
    unregister();

    emitAttendanceAccessRefresh();

    expect(listener).not.toHaveBeenCalled();
  });

  it('a second registration REPLACES the first (the technician tree is a singleton)', () => {
    const first = jest.fn();
    const second = jest.fn();
    registerAttendanceAccessRefresh(first);
    registerAttendanceAccessRefresh(second);

    emitAttendanceAccessRefresh();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('unregistering a STALE handle does not detach the current registrant', () => {
    const first = jest.fn();
    const second = jest.fn();
    const staleUnregister = registerAttendanceAccessRefresh(first);
    registerAttendanceAccessRefresh(second);

    staleUnregister();
    emitAttendanceAccessRefresh();

    expect(second).toHaveBeenCalledTimes(1);
  });

  it('an old unregister is a no-op after the reset dropped everyone', () => {
    const listener = jest.fn();
    const unregister = registerAttendanceAccessRefresh(listener);
    resetAttendanceAccessEvents();

    expect(() => unregister()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('reachability (the notifications screen tap guard)', () => {
  it('defaults to false — a deep link can never open a tab that does not exist', () => {
    expect(isAttendanceReachable()).toBe(false);
  });

  it('publishes true once the store says the tab exists', () => {
    setAttendanceReachable(true);

    expect(isAttendanceReachable()).toBe(true);
  });

  it('the reset slams it back shut', () => {
    setAttendanceReachable(true);
    resetAttendanceAccessEvents();

    expect(isAttendanceReachable()).toBe(false);
  });
});

describe('isAttendanceEventType — the prefix vocabulary', () => {
  it('every attendance.* subtype matches, known or not', () => {
    expect(isAttendanceEventType('attendance.holiday_added')).toBe(true);
    expect(isAttendanceEventType('attendance.holiday_removed')).toBe(true);
    expect(isAttendanceEventType('attendance.something_future_epics_add')).toBe(true);
  });

  it('other families do not match', () => {
    expect(isAttendanceEventType('report_ready')).toBe(false);
    expect(isAttendanceEventType('on_my_way')).toBe(false);
  });

  it.each([
    ['attendance'], // the dot is the boundary — a bare prefix is not an event
    ['myattendance.holiday_added'],
    ['ATTENDANCE.holiday_added'],
    [''],
  ])('%p is not an attendance event', (eventType) => {
    expect(isAttendanceEventType(eventType)).toBe(false);
  });

  it('the reset drops the listener AND reachability together', () => {
    const listener = jest.fn();
    registerAttendanceAccessRefresh(listener);
    setAttendanceReachable(true);

    resetAttendanceAccessEvents();

    emitAttendanceAccessRefresh();
    expect(listener).not.toHaveBeenCalled();
    expect(isAttendanceReachable()).toBe(false);
  });
});
