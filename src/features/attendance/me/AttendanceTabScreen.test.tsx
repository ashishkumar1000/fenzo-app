/**
 * Tests for AttendanceTabScreen (Story 15-10) — the tab's state ROUTER,
 * with the store, the summary hook and navigation mocked so the routing
 * logic stays isolated:
 *  - unknown → spinner; none → nothing (FR-3: no attendance UI anywhere);
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
}));

jest.mock('./useAttendanceSummary', () => ({
  useAttendanceSummary: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Text } from 'react-native';
import { Button } from '../../../components/ui';
import { useAttendanceAccess, refreshAttendanceAccessOnFocus } from './attendanceAccessStore';
import { useAttendanceSummary } from './useAttendanceSummary';
import { AttendanceSummaryView } from './AttendanceSummaryView';
import type { AttendanceSummaryState } from './useAttendanceSummary';
import type { AttendanceAccessStateSnapshot } from './attendanceAccessStore';
import type { AttendanceAccess, AttendanceSummary } from '../../../services';
import AttendanceTabScreen from './AttendanceTabScreen';

const useAttendanceAccessMock = useAttendanceAccess as jest.Mock;
const useAttendanceSummaryMock = useAttendanceSummary as jest.Mock;
const refreshOnFocusMock = refreshAttendanceAccessOnFocus as jest.Mock;

const SUMMARY: AttendanceSummary = {
  officeId: 'o1',
  officeName: 'HQ',
  startTime: '09:30',
  endTime: '18:00',
  lateCutOffMinutes: 15,
  weeklyOffDays: [6, 7],
};

function access(
  overrides: Partial<AttendanceAccess> = {},
): AttendanceAccess {
  return {
    attendanceEnabled: true,
    attendanceAccess: 'active',
    attendanceStartDate: null,
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

function renderScreen(storeState: AttendanceAccessStateSnapshot = ACTIVE) {
  const ctx = makeNavigation();
  useAttendanceAccessMock.mockReturnValue(storeState);
  useAttendanceSummaryMock.mockReturnValue({
    state: summaryState(),
    refresh: summaryRefresh,
  });

  const element = (nav: unknown) => (
    <AttendanceTabScreen navigation={nav as never} route={{} as never} />
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(element(ctx.navigation));
  });
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

function textNodes(root: ReactTestRenderer.ReactTestInstance, value: string) {
  return root.findAll((n) => n.type === Text && n.props.children === value);
}

beforeEach(() => {
  jest.resetAllMocks();
  consumed = 0;
});

describe('the state router', () => {
  it('unknown → the defensive spinner, nothing else', () => {
    const screen = renderScreen(UNKNOWN);

    expect(screen.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(screen.root.findAllByType(AttendanceSummaryView)).toHaveLength(0);
  });

  it('none → renders nothing (FR-3: no attendance UI anywhere)', () => {
    const screen = renderScreen(NONE);

    expect(screen.root.findAllByType(ActivityIndicator)).toHaveLength(0);
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

  it('history_only → the ended banner only, no summary rows', () => {
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

  it('no check-in control exists in ANY state, and the header is never bare "Today"', () => {
    for (const state of [UNKNOWN, NONE, ACTIVE, ready('upcoming'), HISTORY_ONLY]) {
      const screen = renderScreen(state);
      expect(textContaining(screen.root, 'Check in')).toHaveLength(0);
      expect(textContaining(screen.root, 'Check out')).toHaveLength(0);
      expect(textNodes(screen.root, 'Today')).toHaveLength(0);
      expect(textNodes(screen.root, 'Attendance').length).toBe(1); // the header
    }
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
