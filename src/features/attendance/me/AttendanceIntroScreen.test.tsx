/**
 * Tests for AttendanceIntroScreen (Story 15-10) — the FR-4 first-entry
 * intro. The spec-critical ORDER: the primary CTA asks for location
 * permission FIRST, then records onboarding, then goes back — permission
 * result and onboarding completion are separate facts, so a DENIED outcome
 * (a resolution, not a throw) still records ("denied never dead-ends"),
 * while a THROWN permission request records nothing and leaves the intro
 * up with an inline error and a working Retry. "Not now" dismisses with
 * ZERO service calls, and a double-tap during the ask is latched to one
 * POST. Services are mocked at the barrel; the store update is mocked so
 * the recorded timestamp can be asserted verbatim.
 */
jest.mock('../../technicianApp/geolocation', () => ({
  requestLocationPermission: jest.fn(),
}));

jest.mock('../../../services', () => ({
  attendanceMeService: {
    recordOnboarding: jest.fn(),
    getAccess: jest.fn(),
    getSummary: jest.fn(),
  },
}));

jest.mock('./attendanceAccessStore', () => ({
  applyOnboardedAt: jest.fn(),
  useAttendanceAccess: jest.fn(),
}));

import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { Button, InlineError } from '../../../components/ui';
import { requestLocationPermission } from '../../technicianApp/geolocation';
import { attendanceMeService } from '../../../services';
import { applyOnboardedAt, useAttendanceAccess } from './attendanceAccessStore';
import AttendanceIntroScreen from './AttendanceIntroScreen';

const requestPermissionMock = requestLocationPermission as jest.Mock;
const recordOnboarding = attendanceMeService.recordOnboarding as jest.Mock;
const applyOnboardedAtMock = applyOnboardedAt as jest.Mock;
const useAttendanceAccessMock = useAttendanceAccess as jest.Mock;

/** The store snapshot the intro sees. Default: active + not onboarded —
 *  the world every pre-existing test was written in. */
function storeMock(attendanceAccess: string | null = 'active') {
  return {
    status: attendanceAccess === null ? 'unknown' : 'ready',
    access:
      attendanceAccess === null
        ? null
        : {
            attendanceEnabled: true,
            attendanceAccess,
            attendanceStartDate: null,
            enabledAt: null,
            onboardedAt: null,
            officeId: 'o1',
            officeName: 'HQ',
          },
  };
}

const ONBOARDED_AT = '2026-09-28T09:00:00Z';

type Screen = {
  navigation: Record<string, jest.Mock>;
  renderer: ReactTestRenderer.ReactTestRenderer;
  readonly root: ReactTestRenderer.ReactTestInstance;
};

function renderScreen(): Screen {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AttendanceIntroScreen
        navigation={navigation as never}
        route={{} as never}
      />,
    );
  });
  return {
    navigation,
    renderer,
    get root() {
      return renderer.root;
    },
  };
}

function primaryButton(screen: Screen) {
  const button = screen.root
    .findAllByType(Button)
    .find((b) => b.props.children === 'Allow location access');
  expect(button).toBeDefined();
  return button!;
}

function notNowButton(screen: Screen) {
  const button = screen.root
    .findAllByType(Button)
    .find((b) => b.props.children === "Not now — I'll browse without it");
  expect(button).toBeDefined();
  return button!;
}

function press(screen: Screen, button: ReactTestRenderer.ReactTestInstance) {
  return act(async () => {
    button.props.onPress();
    await flush();
  });
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

function inlineErrors(screen: Screen) {
  return screen.root.findAllByType(InlineError);
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — an unconsumed mockRejectedValueOnce
  // would leak into the next test's first tap.
  jest.resetAllMocks();
  requestPermissionMock.mockResolvedValue({ status: 'granted' });
  recordOnboarding.mockResolvedValue({ onboardedAt: ONBOARDED_AT });
  // The store snapshot the intro consumes (default: active, the world the
  // original tests were written in).
  useAttendanceAccessMock.mockReturnValue(storeMock('active'));
});

describe('copy', () => {
  it('renders the three copy blocks (headline, body, privacy note)', () => {
    const screen = renderScreen();

    const text = (part: string) =>
      screen.root.findAll((n) => {
        if (n.type !== Text) return false;
        const children = n.props.children;
        const flat = Array.isArray(children)
          ? children.map(String).join('')
          : String(children ?? '');
        return flat.includes(part);
      });

    expect(text('Mark attendance with a tap').length).toBe(1);
    expect(text('Fenzo checks your location').length).toBe(1);
    expect(text('never in the background').length).toBe(1);
  });
});

describe('the primary CTA — permission first, then record', () => {
  it('asks permission, THEN POSTs onboarding, applies the timestamp, and goes back — in that order', async () => {
    const screen = renderScreen();
    await press(screen, primaryButton(screen));

    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
    expect(recordOnboarding).toHaveBeenCalledTimes(1);
    // The spec rule: the permission ASK precedes the POST (separate facts).
    expect(requestPermissionMock.mock.invocationCallOrder[0]).toBeLessThan(
      recordOnboarding.mock.invocationCallOrder[0],
    );
    expect(applyOnboardedAtMock).toHaveBeenCalledWith(ONBOARDED_AT);
    expect(screen.navigation.goBack).toHaveBeenCalledTimes(1);
    expect(inlineErrors(screen)).toHaveLength(0);
  });

  it('a DENIED permission outcome still records (denied never dead-ends)', async () => {
    requestPermissionMock.mockResolvedValue({
      status: 'denied',
      error: 'Location access was denied.',
    });
    const screen = renderScreen();
    await press(screen, primaryButton(screen));

    expect(recordOnboarding).toHaveBeenCalledTimes(1);
    expect(applyOnboardedAtMock).toHaveBeenCalledWith(ONBOARDED_AT);
    expect(screen.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('while the ask is in flight the button is loading, and a double-tap latches to ONE POST', async () => {
    let release!: (v: { status: string }) => void;
    requestPermissionMock.mockImplementationOnce(
      () => new Promise<{ status: string }>((resolve) => (release = resolve)),
    );
    const screen = renderScreen();
    const button = primaryButton(screen);

    act(() => {
      button.props.onPress(); // first tap — the ask is pending
    });
    expect(button.props.loading).toBe(true);
    expect(button.props.disabled).toBe(true);

    await act(async () => {
      button.props.onPress(); // impulsive second tap — must be swallowed
      await flush();
    });
    act(() => {
      release({ status: 'granted' });
    });
    await flush();

    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
    expect(recordOnboarding).toHaveBeenCalledTimes(1);
    expect(screen.navigation.goBack).toHaveBeenCalledTimes(1);
  });
});

describe('failure paths — the intro stays up', () => {
  it('a THROWN permission request shows the inline error and records NOTHING; Retry completes the flow', async () => {
    requestPermissionMock.mockRejectedValueOnce(
      new Error('nitro permission crash'),
    );
    const screen = renderScreen();
    await press(screen, primaryButton(screen));

    expect(inlineErrors(screen)).toHaveLength(1);
    expect(inlineErrors(screen)[0].props.message).toBe('nitro permission crash');
    expect(recordOnboarding).not.toHaveBeenCalled();
    expect(applyOnboardedAtMock).not.toHaveBeenCalled();
    expect(screen.navigation.goBack).not.toHaveBeenCalled();

    // Retry: the latch must be released by the failure.
    await press(screen, primaryButton(screen));

    expect(requestPermissionMock).toHaveBeenCalledTimes(2);
    expect(recordOnboarding).toHaveBeenCalledTimes(1);
    expect(screen.navigation.goBack).toHaveBeenCalledTimes(1);
    expect(inlineErrors(screen)).toHaveLength(0);
  });

  it('a POST failure shows the inline error and stays; Retry succeeds', async () => {
    recordOnboarding.mockRejectedValueOnce({
      status: 0,
      message: 'Network request failed',
    });
    const screen = renderScreen();
    await press(screen, primaryButton(screen));

    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
    expect(inlineErrors(screen)).toHaveLength(1);
    expect(inlineErrors(screen)[0].props.message).toBe('Network request failed');
    expect(applyOnboardedAtMock).not.toHaveBeenCalled();
    expect(screen.navigation.goBack).not.toHaveBeenCalled();

    await press(screen, primaryButton(screen));

    expect(screen.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('a message-less failure shows the human fallback copy, not "undefined"', async () => {
    recordOnboarding.mockRejectedValueOnce({});
    const screen = renderScreen();
    await press(screen, primaryButton(screen));

    expect(inlineErrors(screen)[0].props.message).toBe(
      'Something went wrong. Check your connection and try again.',
    );
  });
});

describe('"Not now" — browse without recording', () => {
  it('goes back with ZERO service calls (the ask reappears on the next entry)', async () => {
    const screen = renderScreen();
    act(() => {
      notNowButton(screen).props.onPress();
    });

    expect(screen.navigation.goBack).toHaveBeenCalledTimes(1);
    expect(requestPermissionMock).not.toHaveBeenCalled();
    expect(recordOnboarding).not.toHaveBeenCalled();
    expect(applyOnboardedAtMock).not.toHaveBeenCalled();
  });
});

describe('the BMAD none-watch (FR-3): access revoked while the intro is open', () => {
  it('dismisses immediately when the store resolves `none` — no permission ask, no POST', async () => {
    useAttendanceAccessMock.mockReturnValue(storeMock('active'));
    const screen = renderScreen();
    expect(screen.navigation.goBack).not.toHaveBeenCalled();

    // The hook is mocked, so the re-render must be driven explicitly
    // (the real store's subscribers do this via the snapshot change).
    useAttendanceAccessMock.mockReturnValue(storeMock('none'));
    await act(async () => {
      screen.renderer.update(
        <AttendanceIntroScreen
          navigation={screen.navigation as never}
          route={{} as never}
        />,
      );
      await Promise.resolve();
    });

    expect(screen.navigation.goBack).toHaveBeenCalledTimes(1);
    expect(requestPermissionMock).not.toHaveBeenCalled();
    expect(recordOnboarding).not.toHaveBeenCalled();
  });

  it('stays up for every non-`none` state (unknown/active/upcoming/history_only)', async () => {
    const screen = renderScreen();
    for (const state of [null, 'upcoming', 'history_only']) {
      useAttendanceAccessMock.mockReturnValue(storeMock(state));
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(screen.navigation.goBack).not.toHaveBeenCalled();
  });
});
