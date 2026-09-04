/**
 * StatusFilterBar — pins the filter-chip visual contract from
 * DESIGN_SYSTEM.md ("Selection controls — navigation vs filter"): the active
 * chip is a soft tint (primarySoft bg + primary border + primaryHover label),
 * never a solid primary fill. Behavior (which chips show per scope, onChange)
 * is covered by the JobsScreen tests; this file guards the styling alone.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';

import { StatusFilterBar } from '../src/features/jobs/components/StatusFilterBar';
import { colors } from '../src/theme';
import type { JobFilter } from '../src/features/jobs/types';

async function render(value: JobFilter) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      React.createElement(StatusFilterBar, { value, onChange: jest.fn() }),
    );
  });
  return renderer;
}

/**
 * The rendered chips, one instance per filter. Matched by props, not
 * `findAllByType(Pressable)` — react-native's Pressable export doesn't
 * survive test-renderer type matching under the jest preset, and Pressable's
 * a11y props propagate to inner host views, so dedupe per label.
 */
function chipsOf(renderer: ReactTestRenderer.ReactTestRenderer) {
  const seen = new Set<string>();
  return renderer.root
    .findAll(
      node =>
        typeof node.props?.accessibilityState === 'object' &&
        node.type !== Text, // exclude the label inside each chip
    )
    .filter(chip => {
      const label = chip.findByType(Text).props.children;
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

/**
 * Resolves a chip's style for assertion — Pressable styles are functions of
 * the pressed state, so evaluate them unpressed before flattening.
 */
function flattenStyle(style: unknown): Record<string, unknown> {
  const resolved =
    typeof style === 'function' ? (style as (s: { pressed: boolean }) => unknown)({ pressed: false }) : style;
  return (StyleSheet.flatten(resolved as Parameters<typeof StyleSheet.flatten>[0]) ??
    {}) as Record<string, unknown>;
}

it('marks exactly one chip as selected', async () => {
  const renderer = await render('completed');

  const selected = chipsOf(renderer)
    .filter(chip => chip.props.accessibilityState.selected)
    .map(chip => chip.findByType(Text).props.children);
  expect(selected).toEqual(['Done']);
});

it('styles the active chip as a soft tint, never a solid primary fill', async () => {
  const renderer = await render('completed');

  const active = chipsOf(renderer).find(chip => chip.props.accessibilityState.selected);
  if (!active) throw new Error('active chip not rendered');

  const chipStyle = flattenStyle(active.props.style);
  expect(chipStyle.backgroundColor).toBe(colors.primarySoft);
  expect(chipStyle.borderColor).toBe(colors.primary);

  const labelStyle = StyleSheet.flatten(active.findByType(Text).props.style);
  expect(labelStyle.color).toBe(colors.primaryHover);
});
