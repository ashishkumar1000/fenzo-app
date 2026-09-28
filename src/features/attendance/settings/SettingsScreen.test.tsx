/**
 * Tests for the Attendance Settings landing (Story 15-6): two owner-only
 * tiles ("Weekly off" + "Holidays") that wire into the nav graph. The
 * screen is a routing shim — the contract here is that BOTH tiles render
 * and navigate to the right routes, and that the back button works even
 * when the screen is the only route on the stack (deep link).
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import SettingsScreen from './SettingsScreen';

function renderSettings(
  canGoBack = true,
): {
  renderer: ReactTestRenderer.ReactTestRenderer;
  navigation: Record<string, jest.Mock>;
} {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(canGoBack),
  };
  const route = { params: undefined };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <SettingsScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );
  });
  return { renderer, navigation };
}

/**
 * The tile Pressable for a label. `findAll` by label is ambiguous (RTR
 * mirrors the composite `Pressable` through its host `View`s, both carry
 * the label); the Pressable is the one with the `onPress` handler.
 */
function findTile(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const matches = renderer.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('SettingsScreen', () => {
  it('renders both tiles with their titles + subtitles', () => {
    const { renderer } = renderSettings();
    const texts = renderer.root
      .findAll((node) => typeof node.props.children === 'string')
      .map((node) => node.props.children as string);
    expect(texts).toContain('Weekly off');
    expect(texts).toContain('Tenant default & per-employee overrides');
    expect(texts).toContain('Holidays');
    expect(texts).toContain('Tenant-wide holiday list');
  });

  it('renders exactly three tiles, in order (the ordered label list)', () => {
    // 15-6 review iteration 1: the old assertion deduped through a Set,
    // which still passed if a tile rendered twice or a third appeared.
    // Filtering to the Pressable (the only node carrying `onPress`) gives
    // one node per control IN RENDER ORDER — the header's back control and
    // exactly the tiles, nothing else. The third tile is 15-9's roster
    // entry (Team enrolment) — placed first as the most consequential
    // attendance setting.
    const { renderer } = renderSettings();
    const buttons = renderer.root.findAll(
      (node) =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.onPress === 'function' &&
        typeof node.props.accessibilityLabel === 'string',
    );
    expect(buttons.map((node) => node.props.accessibilityLabel)).toEqual([
      'Go back',
      'Team enrolment',
      'Weekly off',
      'Holidays',
    ]);
  });

  it('renders the Team enrolment tile with its subtitle', () => {
    const { renderer } = renderSettings();
    const texts = renderer.root
      .findAll((node) => typeof node.props.children === 'string')
      .map((node) => node.props.children as string);
    expect(texts).toContain('Team enrolment');
    expect(texts).toContain('Start dates, offices & tracking per employee');
  });

  it('tapping "Team enrolment" navigates to AttendanceEnrolments', () => {
    const { renderer, navigation } = renderSettings();
    act(() => {
      findTile(renderer, 'Team enrolment').props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceEnrolments');
  });

  it('tapping "Weekly off" navigates to AttendanceWeeklyOff', () => {
    const { renderer, navigation } = renderSettings();
    act(() => {
      findTile(renderer, 'Weekly off').props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceWeeklyOff');
  });

  it('tapping "Holidays" navigates to AttendanceHolidays', () => {
    const { renderer, navigation } = renderSettings();
    act(() => {
      findTile(renderer, 'Holidays').props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceHolidays');
  });

  it('back goes back when there is a screen beneath', () => {
    const { renderer, navigation } = renderSettings(true);
    const back = renderer.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Go back' &&
        typeof node.props.onPress === 'function',
    );
    expect(back.length).toBeGreaterThan(0);
    act(() => {
      back[0].props.onPress();
    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('back falls back to the tabs when the screen is the stack root (deep link)', () => {
    const { renderer, navigation } = renderSettings(false);
    const back = renderer.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Go back' &&
        typeof node.props.onPress === 'function',
    );
    expect(back.length).toBeGreaterThan(0);
    act(() => {
      back[0].props.onPress();
    });
    // `goBack` with nothing beneath strands the user — reset to the tabs
    // (the HolidaysScreen / JobDetailScreen pattern).
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('MainTabs');
  });
});
