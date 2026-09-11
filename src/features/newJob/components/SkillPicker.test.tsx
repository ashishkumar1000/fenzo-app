/**
 * Render/selection tests for the SkillPicker tile grid (Story 5.1): the
 * labels render, a tap fires `onChange` with the option's id, and the
 * selected tile is marked via `accessibilityState`. Presentational only —
 * the parent owns the option list, so no store or client is involved.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { SkillPicker } from './SkillPicker';
import type { Skill } from '../../../services';

const SKILLS: Skill[] = [
  { id: 'sk-plumb', name: 'Plumbing' },
  { id: 'sk-elec', name: 'Electrical' },
  { id: 'sk-pest', name: 'Pest Control' },
];

function renderPicker(value: string | null, onChange: (id: string) => void) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(<SkillPicker options={SKILLS} value={value} onChange={onChange} />);
  });
  return renderer.root;
}

/**
 * The tile Pressables only — `accessibilityRole: 'button'` also matches
 * hosts Pressable renders internally, which carry no onPress.
 */
function tiles(root: ReactTestRenderer.ReactTestInstance) {
  return root
    .findAllByProps({ accessibilityRole: 'button' })
    .filter(t => typeof t.props.onPress === 'function');
}

function tileLabels(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(Text).map(t => t.props.children as string);
}

it('renders one tile per catalog skill, label only', () => {
  const root = renderPicker(null, () => {});
  const labels = tileLabels(root);
  expect(labels).toContain('Plumbing');
  expect(labels).toContain('Electrical');
  expect(labels).toContain('Pest Control');
});

it('marks the selected skill via accessibilityState', () => {
  const root = renderPicker('sk-elec', () => {});
  expect(tiles(root).map(t => t.props.accessibilityState)).toEqual([
    { selected: false },
    { selected: true },
    { selected: false },
  ]);
});

it('fires onChange with the tapped skill id', () => {
  const onChange = jest.fn();
  const root = renderPicker(null, onChange);
  const t = tiles(root);
  act(() => {
    t[2].props.onPress();
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('sk-pest');
});