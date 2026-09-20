/**
 * Card — pins the `disabled` contract on interactive cards (added for Home's
 * quick-action setup gate, product feedback 2026-09-20): the flag flows to
 * the underlying Pressable — which is what blocks the press and the press
 * feedback at the platform level — and the caller's `accessibilityState`
 * still passes through for screen readers. A non-interactive card ignores
 * `disabled` entirely (it renders a plain View, no Pressable at all).
 *
 * The press-blocking itself is Pressable's own behaviour; this file pins
 * that the wiring reaches it rather than re-testing the platform.
 *
 * The Pressable is found via its `onPress` handler identity, not by type —
 * under the RN jest preset `Pressable`'s type identity is not stable across
 * module accesses (same workaround as the QuickActions tests).
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Card } from '../Card';

const mountedRenderers: ReactTestRenderer[] = [];

function renderCard(props: Record<string, unknown>) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Card {...props}>Tile</Card>);
  });
  mountedRenderers.push(renderer);
  return renderer.root;
}

afterEach(() => {
  act(() => {
    mountedRenderers.forEach(renderer => renderer.unmount());
  });
  mountedRenderers.length = 0;
});

/** The interactive card's Pressable, matched by handler identity. The root
 * Card element also carries `onPress`, so exclude it — we want the inner
 * press target the prop was forwarded to. */
function pressableOf(root: ReactTestInstance, onPress: unknown): ReactTestInstance {
  const match = root.findAll(
    node => node !== root && node.props.onPress === onPress,
  );
  expect(match.length).toBe(1);
  return match[0];
}

it('an interactive card forwards onPress to its Pressable', () => {
  const onPress = jest.fn();
  const root = renderCard({ interactive: true, onPress });

  expect(pressableOf(root, onPress).props.disabled).toBeFalsy();
});

it('a disabled interactive card passes disabled to the Pressable', () => {
  const onPress = jest.fn();
  const root = renderCard({
    interactive: true,
    disabled: true,
    onPress,
    accessibilityState: { disabled: true },
  });

  const pressable = pressableOf(root, onPress);
  // `disabled` on the Pressable is what actually swallows the touch —
  // the 0.5-opacity dimming stays the caller's job (matches Button).
  expect(pressable.props.disabled).toBe(true);
  // Screen readers still learn the tile is unavailable.
  expect(pressable.props.accessibilityState).toEqual({ disabled: true });
});

it('a non-interactive card renders no press target, so disabled is moot', () => {
  const onPress = jest.fn();
  const root = renderCard({ disabled: true, onPress });

  // (Length, not toEqual — deep equality against renderer instances blows up.)
  expect(
    root.findAll(node => node !== root && node.props.onPress === onPress).length,
  ).toBe(0);
  expect(root.findByProps({ children: 'Tile' })).toBeTruthy();
});

it('forwards accessibilityRole to the press target and the plain view', () => {
  const onPress = jest.fn();
  const interactive = renderCard({
    interactive: true,
    onPress,
    accessibilityRole: 'button',
  });
  expect(pressableOf(interactive, onPress).props.accessibilityRole).toBe(
    'button',
  );

  const plain = renderCard({ accessibilityRole: 'button' });
  expect(plain.findByProps({ children: 'Tile' }).props.accessibilityRole).toBe(
    'button',
  );
});
