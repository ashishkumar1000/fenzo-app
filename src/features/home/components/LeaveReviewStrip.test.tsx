/**
 * Component tests for LeaveReviewStrip (Story 20-1, AC 12): a count chip
 * only — never pending rows inline — and ONE press target that routes to
 * the owner's Leave screen. The a11y label is the screen reader's whole
 * story: label + count with correct singular/plural (a "1 requests" label
 * is a trust failure). Tester stance: boundary counts (1 vs many) and the
 * exact routing.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { LeaveReviewStrip } from './LeaveReviewStrip';

let lastRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

function renderStrip(count: number, onPress: () => void) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<LeaveReviewStrip count={count} onPress={onPress} />);
  });
  lastRenderer = renderer;
  return renderer.root;
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  if (lastRenderer) {
    const renderer = lastRenderer;
    lastRenderer = null;
    act(() => renderer.unmount());
  }
});

it('renders the label and the count chip; the count is a sibling Text, not a row', () => {
  const onPress = jest.fn();
  const root = renderStrip(3, onPress);
  expect(
    root.findAll(n => n.type === Text && n.props.children === 'Leave requests to review'),
  ).toHaveLength(1);
  expect(
    root.findAll(n => n.type === Text && n.props.children === 3),
  ).toHaveLength(1);
});

it('the a11y story is correct in the many case: "3 requests"', () => {
  const root = renderStrip(3, jest.fn());
  expect(
    root.find(
      n =>
        typeof n.type === 'string' &&
        n.props.accessibilityRole === 'button' &&
        n.props.accessibilityLabel === 'Leave requests to review, 3 requests',
    ),
  ).toBeDefined();
});

it('the a11y story is correct in the ONE case: singular, never "1 requests"', () => {
  const root = renderStrip(1, jest.fn());
  const label = root
    .findAll(n => typeof n.type === 'string' && n.props.accessibilityRole === 'button')
    .map(n => n.props.accessibilityLabel as string)
    .find(l => l.includes('Leave requests to review'));
  expect(label).toBe('Leave requests to review, 1 request');
});

it('one press files exactly one routing call', () => {
  const onPress = jest.fn();
  const root = renderStrip(2, onPress);
  // The house pressable walk-up: from the label Text to its pressable
  // ancestor (the composite Pressable is mirrored by host Views in RTR).
  const text = root.find(n => n.type === Text && n.props.children === 'Leave requests to review');
  let node = text.parent;
  while (node != null && typeof node.props.onPress !== 'function') {
    node = node.parent;
  }
  expect(node).not.toBeNull();
  act(() => {
    node!.props.onPress();
  });
  expect(onPress).toHaveBeenCalledTimes(1);
});