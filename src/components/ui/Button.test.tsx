/**
 * Tests for the design-system Button's `loading` prop (story 3.3): the
 * spinner replaces the leading slot, the pressable is disabled while
 * loading, the press-feedback handlers detach, and a settled `disabled`
 * stays off the spinner path (it renders the leading icon, not a spinner).
 *
 * Pressables are located by testID, not by type — RN's jest mock makes
 * findAllByType(Pressable) return nothing (same quirk as the bar tests).
 */
import ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { ActivityIndicator, Text } from 'react-native';
import { Button } from './Button';

type TestRoot = ReactTestRenderer.ReactTestInstance;

const TEST_ID = 'button-under-test';

function renderButton(props: Parameters<typeof Button>[0]): TestRoot {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<Button {...props} testID={TEST_ID} />);
  });
  return renderer.root;
}

describe('Button', () => {
  it('renders its label', () => {
    const root = renderButton({ children: 'Mark complete' });
    const labels = root.findAllByType(Text).map((t: ReactTestRenderer.ReactTestInstance) => t.props.children);
    expect(labels).toContain('Mark complete');
  });

  it('fires onPress when enabled', () => {
    const onPress = jest.fn();
    const root = renderButton({ children: 'On my way', onPress });
    const pressable = root
      .findAllByProps({ testID: TEST_ID })
      .filter((p: ReactTestRenderer.ReactTestInstance) => typeof p.props.onPress === 'function')[0];
    expect(pressable).toBeDefined();
    act(() => {
      pressable.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('loading → a spinner renders in the leading slot', () => {
    const root = renderButton({ children: 'On my way', loading: true });
    expect(root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  it('not loading → no spinner', () => {
    const root = renderButton({ children: 'On my way' });
    expect(root.findAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it('loading → the pressable is disabled and press feedback detaches', () => {
    const onPress = jest.fn();
    const root = renderButton({ children: 'On my way', loading: true, onPress });
    // Duplicate traversal entries can carry stale/partial prop snapshots —
    // collect each value rather than trusting the first entry.
    const entries = root
      .findAllByProps({ testID: TEST_ID })
      .filter((p: ReactTestRenderer.ReactTestInstance) => typeof p.props.onPress === 'function');
    const propValue = (name: string) =>
      entries
        .map((p: ReactTestRenderer.ReactTestInstance) => (p.props as Record<string, unknown>)[name])
        .find(v => v !== undefined);
    expect(propValue('disabled')).toBe(true);
    expect(propValue('onPressIn')).toBeUndefined();
    expect(propValue('onPressOut')).toBeUndefined();
  });

  it('disabled alone never shows a spinner (spinner is the loading prop, not disabled)', () => {
    const root = renderButton({ children: 'On my way', disabled: true });
    expect(root.findAllByType(ActivityIndicator)).toHaveLength(0);
    // Duplicate traversal entries can carry stale props — collect the value.
    const disabled = root
      .findAllByProps({ testID: TEST_ID })
      .map((p: ReactTestRenderer.ReactTestInstance) => p.props.disabled as boolean | undefined)
      .find((d: boolean | undefined) => d !== undefined);
    expect(disabled).toBe(true);
  });
});