/**
 * Tests for AttendanceTabScreen (Story 15-10) — the tab's state ROUTER,
 * with the store, the summary hook and navigation mocked so the routing
 * logic stays isolated:
 *  - unknown → the labelled shimmer block; none → nothing (FR-3: no
 *    attendance UI anywhere);
 *  - active → the summary view; upcoming → the start headline + the early
 *    onboarding CTA (only while the intro is still owed);
 *  - NO check-in control in ANY state (Epic 16 owns it — absent, not
 *    disabled), and the header always reads "Attendance", never "Today";
 *  - history_only → the ended banner only, no summary rows;
 *  - THE INTRO LATCH (device-found bug + BMAD-review HIGH): the gate pushes
 *    the intro once per TAB ENTRY; the latch re-arms only via a 'state'
 *    event on the screen's OWN navigation (a tab switch to a DIFFERENT tab).
 *    Returning from the root-stack intro, a root-stack event, or a state
 *    event for 'Attendance' itself must not re-trigger it — the listener
 *    MUST NOT live on getParent() (that is the ROOT stack on a tab screen,
 *    whose events include the intro's own push/pop → an infinite re-ask);
 *  - the none-while-focused exit (finding #9): a refresh that returns
 *    `none` while this tab is focused navigates back to Today.
 */
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('./attendanceAccessStore', () => ({
  useAttendanceAccess: jest.fn(),
  refreshAttendanceAccessOnFocus: jest.fn(),
  refreshAttendanceAccessNow: jest.fn(),
}));

jest.mock('./useAttendanceSummary', () => ({
  useAttendanceSummary: jest.fn(),
}));

// 19-6: the real section mounts TWO fetches (pane + summary) — the tab
// suite is the state ROUTER, so the section is a recording probe: its
// MOUNTS (in order), the posture prop and the wire date are what the
// router pins live on. (The factory may only reference `mock`-prefixed
// out-of-scope variables, hence the require-built element.)
// 2026-10: the tab no longer MOUNTS the section inline — the My month
// banner PUSHES the full screen carrying the posture pieces, so the
// router pins moved to the push params (see the banner describe).

// Story 17-6: the Leave section now embeds the history rows — their list
// GET is mocked to an empty first page (the real barrel stays for the
// rest of the tree).
jest.mock('../../../services', () => ({
  ...jest.requireActual('../../../services'),
  attendanceLeaveService: {
    listMyLeave: jest.fn(() =>
      Promise.resolve({ data: [], nextCursor: null, hasMore: false }),
    ),
  },
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshControl, Text } from 'react-native';
import { Button, Skeleton } from '../../../components/ui';
import {
  refreshAttendanceAccessNow,
  useAttendanceAccess,
  refreshAttendanceAccessOnFocus,
} from './attendanceAccessStore';
import { BannerCard } from './BannerCard';
import { useAttendanceSummary } from './useAttendanceSummary';
import { AttendanceSummaryView } from './AttendanceSummaryView';
import type { AttendanceSummaryState } from './useAttendanceSummary';
import type { AttendanceAccessStateSnapshot } from './attendanceAccessStore';
import type { AttendanceAccess, AttendanceSummary } from '../../../services';
import { attendanceLeaveService } from '../../../services';
import { LeaveHistorySection } from '../leave/LeaveHistorySection';
import AttendanceTabScreen from './AttendanceTabScreen';

const useAttendanceAccessMock = useAttendanceAccess as jest.Mock;
const useAttendanceSummaryMock = useAttendanceSummary as jest.Mock;
const refreshOnFocusMock = refreshAttendanceAccessOnFocus as jest.Mock;

// 19-6 — the push ROUTE: what the My month banner carries when it opens
// the full screen ("historyOnly", the ended date, and the active-only
// today signal) is what this suite pins.

// The LeaveHistorySection fetch — armed per-test after the reset below
// (the preset wipes module-factory implementations).
const listMyLeaveMock = attendanceLeaveService.listMyLeave as jest.Mock;

const SUMMARY: AttendanceSummary = {
  officeId: 'o1',
  officeName: 'HQ',
  startTime: '09:30',
  endTime: '18:00',
  lateCutOffMinutes: 15,
  weeklyOffDays: [6, 7],
  officeLatitude: 19.076,
  officeLongitude: 72.8777,
};

function access(
  overrides: Partial<AttendanceAccess> = {},
): AttendanceAccess {
  return {
    attendanceEnabled: true,
    attendanceAccess: 'active',
    attendanceStartDate: null,
    attendanceEndedOn: null,
    enabledAt: '2026-09-28T10:00:00Z',
    onboardedAt: null,
    officeId: 'o1',
    officeName: 'HQ',
    ...overrides,
  };
}

function ready(
  attendanceAccess: AttendanceAccess['attendanceAccess'],
  accessOverrides: Partial<AttendanceAccess> = {},
): AttendanceAccessStateSnapshot {
  return { status: 'ready', access: access({ attendanceAccess, ...accessOverrides }) };
}

const UNKNOWN: AttendanceAccessStateSnapshot = { status: 'unknown', access: null };
const NONE = ready('none');
const ACTIVE = ready('active');
const HISTORY_ONLY = ready('history_only');

function summaryState(
  overrides: Partial<AttendanceSummaryState> = {},
): AttendanceSummaryState {
  return {
    summary: SUMMARY,
    isLoading: false,
    error: null,
    isStale: false,
    ...overrides,
  };
}

const summaryRefresh = jest.fn();

/** An unresolved promise the test holds and releases (the mid-flight pull). */
function pend<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Navigation as a plain object. The latch's 'state' listener arrives on
 *  the screen's OWN navigation (a tab screen sees its navigator's state);
 *  getParent() is the ROOT stack and must stay UNTOUCHED by the component —
 *  pinned by `expect(navigation.getParent).not.toHaveBeenCalled()`. */
function makeNavigation() {
  let ownStateListener: ((e: unknown) => void) | null = null;
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    isFocused: jest.fn(() => true),
    addListener: jest.fn((_event: string, cb: (e: unknown) => void) => {
      ownStateListener = cb;
      return () => {
        ownStateListener = null;
      };
    }),
    getParent: jest.fn(() => null),
  };
  return {
    navigation,
    /** Simulates the tabs navigator re-rendering on another tab. */
    fireTabState(routeName: string) {
      act(() => {
        ownStateListener?.({
          data: { state: { index: 0, routes: [{ key: routeName, name: routeName }] } },
        });
      });
    },
  };
}

type Screen = ReturnType<typeof renderScreen>;

// The tab renders a real Skeleton while unknown — its animation loops
// must be stopped at teardown or the Jest worker crashes (the suite's
// own teardown discipline; react-test-renderer has no auto-cleanup).
const mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderScreen(
  storeState: AttendanceAccessStateSnapshot = ACTIVE,
  sumState: AttendanceSummaryState = summaryState(),
) {
  const ctx = makeNavigation();
  useAttendanceAccessMock.mockReturnValue(storeState);
  useAttendanceSummaryMock.mockReturnValue({
    state: sumState,
    refresh: summaryRefresh,
  });

  const element = (nav: unknown) => (
    <AttendanceTabScreen navigation={nav as never} route={{} as never} />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(element(ctx.navigation));
  });
  mountedRenderers.push(renderer);
  return {
    ...ctx,
    renderer,
    element,
    get root() {
      return renderer.root;
    },
  };
}

/** Runs every focus effect registered since the last fire (the screen
 *  registers TWO per render: the access refetch and the intro gate). */
let consumed = 0;
function fireFocus(screen: Screen) {
  const effects = (useFocusEffect as jest.Mock).mock.calls
    .slice(consumed)
    .map((call) => call[0] as () => void);
  consumed = (useFocusEffect as jest.Mock).mock.calls.length;
  expect(effects.length).toBeGreaterThan(0);
  act(() => {
    effects.forEach((effect) => effect());
  });
}

function textContaining(root: ReactTestRenderer.ReactTestInstance, part: string) {
  return root.findAll((n) => {
    if (n.type !== Text) return false;
    const children = n.props.children;
    const flat = Array.isArray(children)
      ? children.map(String).join('')
      : String(children ?? '');
    return flat.includes(part);
  });
}

/** The labelled loading block(s) — the house shimmer idiom (one per
 *  screen, the 19-5 vocabulary). */
function loadingBlocks(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll(
    (node) => node.props.accessibilityLabel === 'Loading attendance',
  );
}

function textNodes(root: ReactTestRenderer.ReactTestInstance, value: string) {
  return root.findAll((n) => n.type === Text && n.props.children === value);
}

beforeEach(() => {
  jest.resetAllMocks();
  consumed = 0;
  // The history GET stays PENDING: this suite renders and asserts
  // SYNCHRONOUSLY (the 15-10 state-router pins), so a resolving promise
  // would settle AFTER the test — a setState outside act whose scheduler
  // tail leaks into the next suite in the worker (found as moving
  // window.dispatchEvent failures across unrelated suites). A pending GET
  // is the honest shape here anyway: the tab suite pins routing, not the
  // history list (pinned in LeaveHistorySection.test).
  listMyLeaveMock.mockReturnValue(new Promise(() => undefined));
});

afterEach(() => {
  act(() => {
    mountedRenderers.forEach((r) => r.unmount());
  });
  mountedRenderers.length = 0;
});

describe('the state router', () => {
  it('unknown → the defensive labelled shimmer block, nothing else', () => {
    const screen = renderScreen(UNKNOWN);

    expect(loadingBlocks(screen.root).length).toBeGreaterThan(0);
    expect(screen.root.findAllByType(Skeleton as never).length).toBeGreaterThanOrEqual(1);
    expect(screen.root.findAllByType(AttendanceSummaryView)).toHaveLength(0);
  });

  it('none → renders nothing (FR-3: no attendance UI anywhere)', () => {
    const screen = renderScreen(NONE);

    expect(loadingBlocks(screen.root)).toHaveLength(0);
    expect(screen.root.findAllByType(AttendanceSummaryView)).toHaveLength(0);
    expect(textContaining(screen.root, 'Attendance tracking')).toHaveLength(0);
  });

  it('active → the summary view renders the FR-4 rows', () => {
    const screen = renderScreen(ACTIVE);

    expect(screen.root.findAllByType(AttendanceSummaryView)).toHaveLength(1);
    expect(textNodes(screen.root, 'Office')).toHaveLength(1);
    expect(textNodes(screen.root, 'HQ')).toHaveLength(1);
    expect(textNodes(screen.root, 'Late cut-off')).toHaveLength(1);
    expect(textContaining(screen.root, 'Attendance starts on')).toHaveLength(0);
  });

  it('upcoming and not onboarded → the start headline AND the "Finish the intro now" CTA', () => {
    const screen = renderScreen(ready('upcoming', { attendanceStartDate: '2026-11-01' }));

    expect(textContaining(screen.root, 'Attendance starts on').length).toBeGreaterThan(0);
    const finish = screen.root
      .findAllByType(Button)
      .find((b) => b.props.children === 'Finish the intro now');
    expect(finish).toBeDefined();
  });

  it('upcoming with no start date falls back to the scheduled headline', () => {
    const screen = renderScreen(ready('upcoming', { attendanceStartDate: null }));

    expect(textNodes(screen.root, 'Attendance start scheduled').length).toBe(1);
  });

  it('upcoming but ALREADY onboarded → no early onboarding CTA', () => {
    const screen = renderScreen(
      ready('upcoming', {
        attendanceStartDate: '2026-11-01',
        onboardedAt: '2026-09-28T09:00:00Z',
      }),
    );

    expect(
      screen.root
        .findAllByType(Button)
        .find((b) => b.props.children === 'Finish the intro now'),
    ).toBeUndefined();
  });

  it('history_only → the ended note, no summary rows, and no check-in control', () => {
    const screen = renderScreen(HISTORY_ONLY);

    expect(textNodes(screen.root, 'Attendance tracking has ended').length).toBeGreaterThan(0);
    expect(screen.root.findAllByType(AttendanceSummaryView)).toHaveLength(0);
    expect(textNodes(screen.root, 'Office')).toHaveLength(0);
  });

  it('the summary hook is enabled exactly for active/upcoming, and focus refreshes access', () => {
    for (const [state, enabled] of [
      [UNKNOWN, false],
      [NONE, false],
      [HISTORY_ONLY, false],
      [ACTIVE, true],
      [ready('upcoming'), true],
    ] as const) {
      const screen = renderScreen(state);
      fireFocus(screen); // the focus effect refreshes access + gates the intro
      expect(useAttendanceSummaryMock).toHaveBeenLastCalledWith(enabled);
    }
    expect(refreshOnFocusMock).toHaveBeenCalled();
  });

  // UPDATED for Story 16-4: the check-in control EXISTS in the active
  // state now (that story owns it); it stays ABSENT — not disabled — in
  // every other state, and the header is never bare "Today".
  it('the check-in control is active-only (absent everywhere else), and the header is never bare "Today"', () => {
    for (const state of [UNKNOWN, NONE, ready('upcoming'), HISTORY_ONLY]) {
      const screen = renderScreen(state);
      expect(textContaining(screen.root, 'Check in')).toHaveLength(0);
      expect(textContaining(screen.root, 'Check out')).toHaveLength(0);
      expect(textNodes(screen.root, 'Today')).toHaveLength(0);
      expect(textNodes(screen.root, 'Attendance').length).toBe(1); // the header
    }
    // Active: the Today section renders the check-in CTA.
    const active = renderScreen(ACTIVE);
    expect(textContaining(active.root, 'Check in').length).toBeGreaterThan(0);
    expect(textNodes(active.root, 'Today')).toHaveLength(0);
    expect(textNodes(active.root, 'Attendance').length).toBe(1); // the header
  });
});

describe('the 19-6 My month routing, in the 2026-10 banner-push shape (D1/D6)', () => {
  /** The tab's "My month" banner, if this posture renders one.
   *  (2026-10: the banner PUSHES the full screen — nothing mounts inline.) */
  function myMonthBanner(root: ReactTestRenderer.ReactTestInstance) {
    const banners = root
      .findAllByType(BannerCard)
      .filter((b) => b.props.title === 'My month');
    return banners.length === 0 ? null : bannerAt(banners);
  }

  // The tab can stack the history banner AND the active banner across a
  // posture flip — the LAST one on screen is the live posture's.
  function bannerAt(banners: ReactTestRenderer.ReactTestInstance[]) {
    return banners[banners.length - 1];
  }

  it('active → My month sits BETWEEN the summary card and Leave', () => {
    const screen = renderScreen(ACTIVE);
    const labels = screen.root
      .findAll((n) => n.type === Text)
      .map((n) =>
        Array.isArray(n.props.children)
          ? n.props.children.join('')
          : String(n.props.children ?? ''),
      );
    // Office comes from the summary card's office/timings line (the 2026-10
    // redesign moved it there), Leave from the section header.
    expect(labels.indexOf('My month')).toBeGreaterThan(labels.indexOf('Office'));
    expect(labels.indexOf('My month')).toBeLessThan(labels.indexOf('Leave'));
  });

  it('active (no today card yet) → the push carries a NULL today signal', () => {
    const screen = renderScreen(ACTIVE);
    act(() => {
      myMonthBanner(screen.root)!.props.onOpen();
    });
    expect(screen.navigation.navigate).toHaveBeenCalledTimes(1);
    const [route, params] = screen.navigation.navigate.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(route).toBe('AttendanceMyMonth');
    expect(params.historyOnly).toBe(false);
    expect(params.attendanceEndedOn).toBeNull();
    expect(params.todaySignal).toBeNull();
  });

  it('active (a today card) → the push today signal snapshots the day and record', () => {
    const screen = renderScreen(
      ACTIVE,
      summaryState({
        summary: {
          ...SUMMARY,
          today: {
            date: '2026-10-01',
            isWorkingDay: true,
            isWeeklyOff: false,
            isHoliday: false,
            holidayName: null,
            leaveState: null,
            leavePart: null,
          },
        },
      }),
    );
    act(() => {
      myMonthBanner(screen.root)!.props.onOpen();
    });
    const params = screen.navigation.navigate.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(params.todaySignal).toBe('2026-10-01||');
  });

  it('upcoming → NO My month at all (absent, not disabled — the zero-fetch posture)', () => {
    const screen = renderScreen(ready('upcoming', { attendanceStartDate: '2026-11-01' }));

    expect(myMonthBanner(screen.root)).toBeNull();
  });

  it('history_only → the dated headline, My month in the history posture, and the Leave history WITHOUT the Apply row', () => {
    const screen = renderScreen(
      ready('history_only', { attendanceEndedOn: '2026-08-31' }),
    );

    expect(textContaining(screen.root, 'Attendance tracking ended on')).toHaveLength(1);
    expect(textContaining(screen.root, '31 Aug')).toHaveLength(1);
    expect(screen.root.findAllByType(AttendanceSummaryView)).toHaveLength(0);
    expect(textContaining(screen.root, 'Apply for leave')).toHaveLength(0);
    expect(screen.root.findAllByType(LeaveHistorySection)).toHaveLength(1);

    act(() => {
      myMonthBanner(screen.root)!.props.onOpen();
    });
    const params = screen.navigation.navigate.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    // The history posture pushes the bootstrap's ended month — the screen
    // opens on the past truth, never today's empty grid.
    expect(params).toEqual({
      attendanceEndedOn: '2026-08-31',
      historyOnly: true,
      todaySignal: null,
    });
  });

  it('history_only with a null date (older BE) → the dateless fallback headline, and the push still carries null', () => {
    const screen = renderScreen(HISTORY_ONLY);

    expect(textNodes(screen.root, 'Attendance tracking has ended').length).toBeGreaterThan(0);
    act(() => {
      myMonthBanner(screen.root)!.props.onOpen();
    });
    expect(screen.navigation.navigate).toHaveBeenCalledWith(
      'AttendanceMyMonth',
      { attendanceEndedOn: null, historyOnly: true, todaySignal: null },
    );
  });

  it('a posture flip re-points the SAME banner; each push snapshots the CURRENT posture', () => {
    const screen = renderScreen(ACTIVE);
    act(() => {
      myMonthBanner(screen.root)!.props.onOpen();
    });
    expect(screen.navigation.navigate).toHaveBeenLastCalledWith(
      'AttendanceMyMonth',
      expect.objectContaining({ historyOnly: false }),
    );

    useAttendanceAccessMock.mockReturnValue(
      ready('history_only', { attendanceEndedOn: '2026-08-31' }),
    );
    act(() => {
      screen.renderer.update(screen.element(screen.navigation));
    });
    // The banner survives the flip (history keeps its live My month).
    expect(myMonthBanner(screen.root)).not.toBeNull();
    act(() => {
      myMonthBanner(screen.root)!.props.onOpen();
    });
    expect(screen.navigation.navigate).toHaveBeenLastCalledWith(
      'AttendanceMyMonth',
      expect.objectContaining({ historyOnly: true, attendanceEndedOn: '2026-08-31' }),
    );
  });
});

describe('the intro gate and its latch (the device-found bug)', () => {
  function introSetup() {
    const screen = renderScreen(ready('active', { onboardedAt: null }));
    // The 'state' listener is registered on the screen's OWN navigation —
    // NOT on getParent() (the root stack; listening there loops "Not now").
    expect(screen.navigation.addListener).toHaveBeenCalledWith('state', expect.any(Function));
    expect(screen.navigation.getParent).not.toHaveBeenCalled();
    return screen;
  }

  it('the first focus pushes the intro exactly once', () => {
    const screen = introSetup();
    fireFocus(screen);

    expect(screen.navigation.navigate).toHaveBeenCalledTimes(1);
    expect(screen.navigation.navigate).toHaveBeenCalledWith('AttendanceIntro');
  });

  it('returning from the intro (a re-focus, latch still set) does NOT push again', () => {
    const screen = introSetup();
    fireFocus(screen);

    // A re-render + re-focus — the root-stack push/pop never touched the
    // tabs navigator, so the latch must hold.
    act(() => {
      screen.renderer.update(screen.element(screen.navigation));
    });
    fireFocus(screen);

    expect(screen.navigation.navigate).toHaveBeenCalledTimes(1);
  });

  it("a tabs-state change to ANOTHER tab re-arms the latch → the next entry pushes again", () => {
    const screen = introSetup();
    fireFocus(screen);
    expect(screen.navigation.navigate).toHaveBeenCalledTimes(1);

    screen.fireTabState('Today');
    act(() => {
      screen.renderer.update(screen.element(screen.navigation));
    });
    fireFocus(screen);

    expect(screen.navigation.navigate).toHaveBeenCalledTimes(2);
    expect(screen.navigation.navigate).toHaveBeenLastCalledWith('AttendanceIntro');
  });

  it("a tabs-state change for 'Attendance' itself does NOT re-arm (the push/pop of the intro is on the ROOT stack)", () => {
    const screen = introSetup();
    fireFocus(screen);
    expect(screen.navigation.navigate).toHaveBeenCalledTimes(1);

    screen.fireTabState('Attendance');
    act(() => {
      screen.renderer.update(screen.element(screen.navigation));
    });
    fireFocus(screen);

    expect(screen.navigation.navigate).toHaveBeenCalledTimes(1);
  });
});

describe('the none-while-focused exit (finding #9)', () => {
  it('a refresh returning none while focused navigates back to Today in the same update', async () => {
    const screen = renderScreen(ACTIVE);
    expect(screen.navigation.navigate).not.toHaveBeenCalled();

    useAttendanceAccessMock.mockReturnValue(NONE);
    await act(async () => {
      screen.renderer.update(screen.element(screen.navigation));
    });

    expect(screen.navigation.navigate).toHaveBeenCalledTimes(1);
    expect(screen.navigation.navigate).toHaveBeenCalledWith('Today');
  });

  it('the same flip while NOT focused does not navigate', async () => {
    const screen = renderScreen(ACTIVE);
    screen.navigation.isFocused.mockReturnValue(false);

    useAttendanceAccessMock.mockReturnValue(NONE);
    await act(async () => {
      screen.renderer.update(screen.element(screen.navigation));
    });

    expect(screen.navigation.navigate).not.toHaveBeenCalled();
  });

  it('landing on none directly never navigates (the was-non-none latch starts closed)', () => {
    const screen = renderScreen(NONE);

    expect(screen.navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('the 20-1 pull-to-refresh (AC 15)', () => {
  it('a pull revalidates BOTH truths together; the spinner is up only while the summary settles', async () => {
    useAttendanceAccessMock.mockReturnValue(ACTIVE);
    const refreshNow = jest.fn(() => Promise.resolve());
    const accessNow = jest.fn();
    (refreshAttendanceAccessNow as unknown as jest.Mock).mockImplementation(accessNow);
    useAttendanceSummaryMock.mockReturnValue({
      state: summaryState(),
      refresh: summaryRefresh,
      refreshNow,
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(<AttendanceTabScreen navigation={makeNavigation().navigation as never} route={{} as never} />);
    });
    mountedRenderers.push(renderer);
    const refreshControl = renderer.root.findAllByType(RefreshControl)[0];
    act(() => {
      refreshControl.props.onRefresh();
    });
    // The access gate and the summary card revalidate as one pull.
    expect(accessNow).toHaveBeenCalledTimes(1);
    expect(refreshNow).toHaveBeenCalledTimes(1);
    await act(async () => {
      await Promise.resolve();
    });
    // Spinner held until the summary settles — then it drops.
    expect(refreshControl.props.refreshing).toBe(false);
  });

  it('a pull while one is already revalidating is ignored — one refresh, no double spinner', async () => {
    useAttendanceAccessMock.mockReturnValue(ACTIVE);
    const release = pend<void>();
    const refreshNow = jest.fn(() => release.promise);
    (refreshAttendanceAccessNow as unknown as jest.Mock).mockImplementation(jest.fn());
    useAttendanceSummaryMock.mockReturnValue({
      state: summaryState(),
      refresh: summaryRefresh,
      refreshNow,
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(<AttendanceTabScreen navigation={makeNavigation().navigation as never} route={{} as never} />);
    });
    mountedRenderers.push(renderer);
    const refreshControl = renderer.root.findAllByType(RefreshControl)[0];
    act(() => {
      refreshControl.props.onRefresh();
      refreshControl.props.onRefresh();
    });
    expect(refreshNow).toHaveBeenCalledTimes(1);
    expect(refreshControl.props.refreshing).toBe(true); // held mid-flight
    release.resolve(undefined);
    await act(async () => {
      await release.promise;
    });
    expect(refreshControl.props.refreshing).toBe(false);
  });

  it('a DOWN summary pull still clears the spinner (the failure never strands the spinner)', async () => {
    useAttendanceAccessMock.mockReturnValue(ACTIVE);
    const refreshNow = jest.fn(() => Promise.reject(new Error('down')));
    (refreshAttendanceAccessNow as unknown as jest.Mock).mockImplementation(jest.fn());
    useAttendanceSummaryMock.mockReturnValue({
      state: summaryState(),
      refresh: summaryRefresh,
      refreshNow,
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = create(<AttendanceTabScreen navigation={makeNavigation().navigation as never} route={{} as never} />);
    });
    mountedRenderers.push(renderer);
    const refreshControl = renderer.root.findAllByType(RefreshControl)[0];
    act(() => {
      refreshControl.props.onRefresh();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(refreshControl.props.refreshing).toBe(false);
  });
});
