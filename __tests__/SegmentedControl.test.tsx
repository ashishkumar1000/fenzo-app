/**
 * SegmentedControl — the Design System's view-switching primitive. Tested at
 * the contract level: one active segment per render, press fires onChange
 * with that segment's value, and the active segment is announced via
 * `accessibilityState.selected` (the same a11y contract as the chip rows).
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';

import { SegmentedControl } from '../src/components/ui/SegmentedControl';
import { colors, radius, shadow } from '../src/theme';

const OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'history', label: 'History' },
] as const;

type Scope = (typeof OPTIONS)[number]['value'];

/** Mounts wrapped in act (repo convention) — returns the renderer + spy. */
async function render(value: Scope) {
  const onChange = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(SegmentedControl<Scope>, {
        options: OPTIONS,
        value,
        onChange,
      }),
    );
  });
  return { renderer, onChange };
}

/**
 * The rendered segments, one instance per option. Matched by props, not
 * `findAllByType(Pressable)` — react-native's Pressable export doesn't
 * survive test-renderer type matching under the jest preset. Pressable's
 * a11y props propagate to inner host views too, so the same segment matches
 * at several tree layers — keep the outermost per label.
 */
function segmentsOf(renderer: ReactTestRenderer.ReactTestRenderer) {
  const seen = new Set<string>();
  return renderer.root
    .findAll(
      node =>
        typeof node.props?.accessibilityState === 'object' &&
        node.type !== Text, // exclude the label inside each segment
    )
    .filter(s => {
      const label = labelOf(s);
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

function labelOf(segment: ReactTestRenderer.ReactTestInstance): string {
  return segment.findByType(Text).props.children;
}

/**
 * Resolves a node's style for assertion — Pressable styles are functions of
 * the pressed state, so evaluate them unpressed before flattening.
 */
function flattenStyle(style: unknown): Record<string, unknown> {
  const resolved =
    typeof style === 'function' ? (style as (s: { pressed: boolean }) => unknown)({ pressed: false }) : style;
  return (StyleSheet.flatten(resolved as Parameters<typeof StyleSheet.flatten>[0]) ??
    {}) as Record<string, unknown>;
}

it('renders one segment per option with the given labels', async () => {
  const { renderer } = await render('today');

  expect(segmentsOf(renderer).map(labelOf)).toEqual([
    'Today',
    'Upcoming',
    'Overdue',
    'History',
  ]);
});

it('marks exactly the active segment as selected', async () => {
  const { renderer } = await render('upcoming');

  const segments = segmentsOf(renderer);
  const selected = segments
    .filter(s => s.props.accessibilityState.selected)
    .map(labelOf);
  expect(segments).toHaveLength(4);
  expect(selected).toEqual(['Upcoming']);
});

it('fires onChange with the pressed segment value', async () => {
  const { renderer, onChange } = await render('today');

  const overdue = segmentsOf(renderer).find(s => labelOf(s) === 'Overdue');
  if (!overdue) throw new Error('Overdue segment not rendered');

  await ReactTestRenderer.act(async () => {
    overdue.props.onPress();
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('overdue');
});

it('does not fire onChange when the already-active segment is pressed', async () => {
  const { renderer, onChange } = await render('today');

  const today = segmentsOf(renderer).find(s => labelOf(s) === 'Today');
  if (!today) throw new Error('Today segment not rendered');

  await ReactTestRenderer.act(async () => {
    today.props.onPress();
  });
  expect(onChange).not.toHaveBeenCalled();
});

/**
 * Pins the view-switching visual contract from DESIGN_SYSTEM.md ("Selection
 * controls — navigation vs filter"): sunken track, and the active segment is
 * a raised card — NOT a solid primary fill. If someone reverts the styling to
 * the banned solid-primary look, this fails before review has to catch it.
 */
it('styles the active segment as a raised card on a sunken track', async () => {
  const { renderer } = await render('upcoming');

  const track = renderer.root.find(
    node =>
      node.type !== Text &&
      flattenStyle(node.props.style)?.backgroundColor === colors.surfaceSunken,
  );
  expect(flattenStyle(track.props.style).borderRadius).toBe(radius.md);

  const active = segmentsOf(renderer).find(s => s.props.accessibilityState.selected);
  if (!active) throw new Error('active segment not rendered');
  const segmentStyle = flattenStyle(active.props.style);
  expect(segmentStyle.backgroundColor).toBe(colors.surfaceCard);
  expect(segmentStyle.elevation).toBe(shadow.sm.elevation); // raised, not filled
});
