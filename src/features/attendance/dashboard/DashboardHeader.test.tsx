/**
 * DashboardHeader per-component tests (Story 19-4, BMAD review
 * verification-gap): the Refresh control is a REAL control, not chrome —
 * while the pull runs it is DISABLED (busy state) and shows the spinner
 * instead of the icon, so a press with unchanged numbers visibly worked;
 * idle, it fires the screen's refetch once per press.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { ActivityIndicator } from 'react-native';
import { DashboardHeader } from './DashboardHeader';

function renderHeader(refreshing?: boolean) {
  const onBack = jest.fn();
  const onRefresh = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <DashboardHeader onBack={onBack} onRefresh={onRefresh} refreshing={refreshing} />,
    );
  });
  return { onBack, onRefresh, renderer };
}

/** The composite mirrors accessibility props onto host Views in the RTR
 *  tree — match the label AND require the onPress (the house idiom). */
function byA11yButton(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): ReactTestRenderer.ReactTestInstance {
  const matches = renderer.root.findAll(
    node => node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('DashboardHeader', () => {
  it('idle: the refresh button enabled and fires the refetch per press', () => {
    const { onRefresh, renderer } = renderHeader(false);
    const refresh = byA11yButton(renderer, 'Refresh');
    expect(refresh.props.disabled).toBe(false);
    expect(refresh.props.accessibilityState.busy).toBe(false);
    act(() => {
      refresh.props.onPress();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('refreshing: the button is DISABLED with the busy state and the spinner swap', () => {
    const { onRefresh, renderer } = renderHeader(true);
    const refresh = byA11yButton(renderer, 'Refresh');
    expect(refresh.props.disabled).toBe(true);
    expect(refresh.props.accessibilityState.busy).toBe(true);
    // The spinner replaces the icon while the pull runs.
    const spinners = renderer.root.findAllByType(ActivityIndicator as never);
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });

  it('the back chip fires onBack', () => {
    const { onBack, renderer } = renderHeader(false);
    const back = byA11yButton(renderer, 'Go back');
    act(() => {
      back.props.onPress();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});