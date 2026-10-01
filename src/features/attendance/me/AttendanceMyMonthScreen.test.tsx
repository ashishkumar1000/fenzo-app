/**
 * Host tests for AttendanceMyMonthScreen (Story 20-1, ACs 12/14) — the
 * full-screen host's ROUTING, with the section component as a recording
 * probe (its own suite is AttendanceMyMonth.test):
 *  - the push-time posture pieces travel to the section as params (one
 *    snapshot per push; every entry opens fresh — the remount doctrine).
 *  - pull-to-refresh drives the handle's combined refresh; the latch is a
 *    ref (a same-tick double pull files ONE refresh, never a GET stack);
 *    a DOWN refresh still drops the spinner.
 *  - "Apply leave" pushes the form with `prefillDate` = the tapped day and
 *    the section's canonical today; history_only leaves the CTA undefined
 *    (nothing renders — leaves are an ACTIVE-posture move).
 *
 * RTR house idioms: RefreshControl found by type inside the ScrollView
 * prop; renderers unmounted at teardown (with --forceExit the suite exits
 * — Jest not exiting is the environment artifact, not a bug).
 */
jest.mock('./AttendanceMyMonth', () => {
  const React = require('react');
  const mounts: Record<string, unknown>[] = [];
  const handles: { refresh: jest.Mock }[] = [];
  const Probe = React.forwardRef(function AttendanceMyMonthProbe(
    props: Record<string, unknown>,
    ref: React.Ref<unknown>,
  ) {
    mounts.push(props);
    React.useImperativeHandle(
      ref,
      () => {
        const handle = { refresh: jest.fn() };
        handles.push(handle);
        return handle;
      },
      [],
    );
    return null;
  });
  return {
    __esModule: true,
    AttendanceMyMonth: Probe,
    __mounts: mounts,
    __handles: handles,
  };
});

jest.mock('../offices/ScreenHeader', () => {
  const React = require('react');
  return { __esModule: true, default: () => null };
});
jest.mock('../calendar/DayStatusLegend', () => ({
  __esModule: true,
  DayStatusLegend: () => null,
}));

import { RefreshControl } from 'react-native';
import { act, create } from 'react-test-renderer';
import AttendanceMyMonthScreen from './AttendanceMyMonthScreen';
import { AttendanceMyMonth } from './AttendanceMyMonth';
import type ReactTestRendererType from 'react-test-renderer';

const handleState = jest.requireMock('./AttendanceMyMonth') as {
  __mounts: Record<string, unknown>[];
  __handles: { refresh: jest.Mock }[];
};

type Params = {
  attendanceEndedOn?: string | null;
  historyOnly?: boolean;
  todaySignal?: string | null;
};

let lastRenderer: ReactTestRendererType.ReactTestRenderer | null = null;

function renderScreen(params: Params = {}, navigationOverride?: { navigate: unknown }) {
  const navigation = {
    navigate: navigationOverride?.navigate ?? jest.fn(),
    goBack: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  };
  let renderer!: ReactTestRendererType.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AttendanceMyMonthScreen navigation={navigation as never} route={{ params } as never} />,
    );
  });
  lastRenderer = renderer;
  return { root: renderer.root, navigation };
}

beforeEach(() => {
  jest.clearAllMocks();
  handleState.__mounts.length = 0;
  handleState.__handles.length = 0;
});

afterEach(() => {
  if (lastRenderer) {
    const renderer = lastRenderer;
    lastRenderer = null;
    act(() => renderer.unmount());
  }
});

it('the push-time posture pieces travel to the section as params (one snapshot per push)', () => {
  renderScreen({
    attendanceEndedOn: '2026-08-31',
    historyOnly: true,
    todaySignal: '2026-08-31||',
  });
  const mount = handleState.__mounts[0];
  expect(mount?.attendanceEndedOn).toBe('2026-08-31');
  expect(mount?.historyOnly).toBe(true);
  expect(mount?.todaySignal).toBe('2026-08-31||');
  expect(mount?.showHead).toBe(false);
});

it('an active push leaves the "Apply leave" CTA wired; history_only leaves it UNDEFINED', () => {
  renderScreen({ historyOnly: false });
  expect(typeof handleState.__mounts[0]?.onApplyLeave).toBe('function');
  renderScreen({ historyOnly: true });
  expect(handleState.__mounts[1]?.onApplyLeave).toBeUndefined();
});

it('"Apply leave" pushes the form with prefill = the tapped day and the canonical today', () => {
  const navigate = jest.fn();
  const { navigation } = renderScreen({ historyOnly: false }, { navigate });
  const apply = handleState.__mounts[0]?.onApplyLeave as (
    d: string,
    t: string | null,
  ) => void;
  apply('2026-10-07', '2026-10-01');
  expect(navigate).toHaveBeenCalledWith('LeaveApply', {
    today: '2026-10-01',
    prefillDate: '2026-10-07',
  });
  void navigation;
});

it('a pull drives the combined refresh and the spinner drops when it settles', async () => {
  const { root } = renderScreen({ historyOnly: false });
  const refreshControl = root.findAllByType(RefreshControl)[0];
  const handle = handleState.__handles[0];
  handle.refresh.mockReturnValueOnce(Promise.resolve());
  act(() => {
    refreshControl.props.onRefresh();
  });
  expect(handle.refresh).toHaveBeenCalledTimes(1);
  await act(async () => {
    await Promise.resolve();
  });
  expect(refreshControl.props.refreshing).toBe(false);
});

it('a same-tick double pull files ONE refresh (the ref latch — no GET stack)', async () => {
  let release!: (v: void) => void;
  const held = new Promise<void>((res) => {
    release = res;
  });
  const { root } = renderScreen({ historyOnly: false });
  const refreshControl = root.findAllByType(RefreshControl)[0];
  const handle = handleState.__handles[0];
  handle.refresh.mockReturnValueOnce(held);
  act(() => {
    refreshControl.props.onRefresh();
    refreshControl.props.onRefresh();
  });
  expect(handle.refresh).toHaveBeenCalledTimes(1);
  expect(refreshControl.props.refreshing).toBe(true);
  release(undefined);
  await act(async () => {
    await held;
  });
  expect(refreshControl.props.refreshing).toBe(false);
});

it('a DOWN refresh still drops the spinner (a failure never strands the spinner)', async () => {
  const { root } = renderScreen({ historyOnly: false });
  const refreshControl = root.findAllByType(RefreshControl)[0];
  const handle = handleState.__handles[0];
  handle.refresh.mockReturnValueOnce(Promise.reject(new Error('down')));
  act(() => {
    refreshControl.props.onRefresh();
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(refreshControl.props.refreshing).toBe(false);
});

it('empty params degrade: historyOnly=false and no push carries a dateless active posture', () => {
  renderScreen();
  const mount = handleState.__mounts[0];
  expect(mount?.historyOnly).toBe(false);
  expect(mount?.attendanceEndedOn).toBeNull();
  expect(typeof mount?.onApplyLeave).toBe('function');
  expect(handleState.__mounts[0]?.onApplyLeave === undefined).toBe(false);
});