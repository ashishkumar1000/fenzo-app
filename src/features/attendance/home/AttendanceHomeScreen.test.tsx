/**
 * Tests for the AttendanceHomeScreen tiles (Story 15-6): two owner-only
 * tiles ("Offices" + "Settings") that wire into the existing nav graph.
 * The screen is a minimal shim — the only contract here is that BOTH
 * tiles render and navigate to the right routes.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import AttendanceHomeScreen from './AttendanceHomeScreen';

function renderHome(canGoBack = true) {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    popTo: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(canGoBack),
  };
  const route = { params: undefined };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <AttendanceHomeScreen
        navigation={navigation as never}
        route={route as never}
      />,
    );
  });
  return { renderer, navigation };
}

/**
 * The tile Pressable for a label. `findByProps({ accessibilityLabel })` is
 * ambiguous: react-test-renderer mirrors the composite `Pressable` with its
 * host `View`, and both carry the label. The Pressable is the one with the
 * `onPress` handler.
 */
function findTile(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const matches = renderer.root.findAll(
    node => node.props.accessibilityLabel === label
      && typeof node.props.onPress === 'function',
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('AttendanceHomeScreen', () => {
  it('renders both tiles with their titles + subtitles', () => {
    const { renderer } = renderHome();
    const texts = renderer.root
      .findAll(node => typeof node.props.children === 'string')
      .map(node => node.props.children as string);
    expect(texts).toContain('Offices');
    expect(texts).toContain('Locations & timing rules');
    expect(texts).toContain('Settings');
    expect(texts).toContain('Weekly off & holidays');
  });

  it('renders exactly two tiles (no dashboard chrome)', () => {
    const { renderer } = renderHome();
    const buttons = renderer.root.findAll(
      node => node.props.accessibilityRole === 'button'
        && typeof node.props.accessibilityLabel === 'string'
        && (node.props.accessibilityLabel === 'Offices'
          || node.props.accessibilityLabel === 'Settings'),
    );
    // react-test-renderer mirrors each `Pressable` down through its host
    // `View`s, so a raw `findAll` counts every tile several times over.
    // The contract is the DEDUPED set of labels: exactly these two tiles
    // and nothing else.
    const labels = Array.from(
      new Set(buttons.map(node => node.props.accessibilityLabel as string)),
    );
    expect(labels.sort()).toEqual(['Offices', 'Settings']);
    expect(buttons.length).toBeGreaterThanOrEqual(labels.length);
  });

  it('tapping "Offices" navigates to AttendanceOffices', () => {
    const { renderer, navigation } = renderHome();
    const officesButton = findTile(renderer, 'Offices');
    act(() => {
      officesButton.props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceOffices');
  });

  it('tapping "Settings" navigates to AttendanceSettings', () => {
    const { renderer, navigation } = renderHome();
    const settingsButton = findTile(renderer, 'Settings');
    act(() => {
      settingsButton.props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('AttendanceSettings');
  });

  it('back goes back when there is a screen beneath (test gap)', () => {
    const { renderer, navigation } = renderHome(true);
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
    // 15-8's wizard may land here with nothing beneath — goBack would
    // strand the owner (the same both-branch contract the other attendance
    // screens pin).
    const { renderer, navigation } = renderHome(false);
    const back = renderer.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Go back' &&
        typeof node.props.onPress === 'function',
    );
    act(() => {
      back[0].props.onPress();
    });
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('MainTabs');
  });
});
