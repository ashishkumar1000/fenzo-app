/**
 * Render/selection tests for the SkillPicker tile grid, redesigned per the
 * 2026-09-20 product-feedback mock:
 *
 * - header row: catalog count chip ("N available") and a "Browse all" link
 *   that fires `onBrowseAll`;
 * - a 3-column grid whose idle state is the FIRST TWO catalog skills (seed
 *   order) plus a "+N More skills" tile that also fires `onBrowseAll` —
 *   2 tiles + the more tile fill exactly one complete row (COLUMNS = 3);
 * - a search field that, when non-empty, searches the WHOLE catalog (so a
 *   match beyond the idle tiles is reachable without leaving the screen) and
 *   shows a no-match message when nothing fits;
 * - a tap fires `onChange` with the option's id; the selected tile is marked
 *   via `accessibilityState`.
 *
 * Selection × cap × search: a selection made outside the first two is
 * pinned onto the idle grid (still exactly two tiles), tapping the selected
 * row re-fires `onChange` with the same id, and a search that matches the
 * selection keeps it visible.
 *
 * Presentational only — the parent owns the option list, so no store or
 * client is involved. `SkillIcon` renders real lucide glyphs here (nothing
 * mocked), but the tiles' icon content is not asserted — only selection
 * state is.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { SkillPicker } from './SkillPicker';
import type { Skill } from '../../../services';

const SKILLS: Skill[] = [
  { id: 'sk-plumb', name: 'Plumbing', description: 'Pipe work', icon: 'droplets' },
  { id: 'sk-elec', name: 'Electrical', description: 'Wiring work', icon: 'cable' },
  { id: 'sk-pest', name: 'Pest Control', description: 'Pests', icon: 'bug' },
];

/** Seven rows so the two-tile cap and the "+N more" tile both engage. */
const SEVEN: Skill[] = [
  ...SKILLS,
  { id: 'sk-ac', name: 'AC Service', description: 'Cooling', icon: 'snowflake' },
  { id: 'sk-clean', name: 'Deep Cleaning', description: 'Full home', icon: 'sparkles' },
  { id: 'sk-leak', name: 'Leak Detection', description: 'Hidden pipe leaks', icon: 'gauge' },
  { id: 'sk-paint', name: 'Painting', description: 'Walls and ceilings', icon: 'paint-roller' },
];

function renderPicker(
  value: string | null,
  onChange: (id: string) => void,
  onBrowseAll: () => void = () => {},
  options: Skill[] = SKILLS,
) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <SkillPicker
        options={options}
        value={value}
        onChange={onChange}
        onBrowseAll={onBrowseAll}
      />,
    );
  });
  return renderer.root;
}

/**
 * The tile Pressables only — `accessibilityRole: 'button'` also matches
 * hosts Pressable renders internally (no onPress), the header's Browse-all
 * link and the "+N more" tile, none of which carry an
 * `accessibilityState`.
 */
function tiles(root: ReactTestRenderer.ReactTestInstance) {
  return root
    .findAllByProps({ accessibilityRole: 'button' })
    .filter(
      t =>
        typeof t.props.onPress === 'function' &&
        t.props.accessibilityState !== undefined,
    );
}

/** Joins a Text node's children — JSX interpolation yields arrays. */
function nodeText(children: unknown): string {
  if (typeof children === 'string' || typeof children === 'number')
    return String(children);
  if (Array.isArray(children)) return children.map(nodeText).join('');
  return '';
}

function tileLabels(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAllByType(Text).map(t => nodeText(t.props.children));
}

function hasText(root: ReactTestRenderer.ReactTestInstance, text: string) {
  return tileLabels(root).some(label => label === text);
}

function typeIntoSearch(
  root: ReactTestRenderer.ReactTestInstance,
  text: string,
) {
  const input = root.findAllByType(TextInput)[0];
  act(() => {
    input.props.onChangeText(text);
  });
}

function pressLabelled(
  root: ReactTestRenderer.ReactTestInstance,
  label: string,
) {
  const target = root.findAllByProps({ accessibilityLabel: label })[0];
  act(() => {
    target.props.onPress();
  });
}

it('renders the seeded catalog tiles, label only', () => {
  const root = renderPicker(null, () => {});
  const labels = tileLabels(root);
  expect(labels).toContain('Plumbing');
  expect(labels).toContain('Electrical');
  // The idle grid caps at two tiles — Pest Control sits behind the "+N
  // more" tile.
  expect(labels).not.toContain('Pest Control');
  expect(labels).toContain('+1');
  expect(labels).toContain('More skills');
});

it('marks the selected skill via accessibilityState', () => {
  const root = renderPicker('sk-elec', () => {});
  expect(tiles(root).map(t => t.props.accessibilityState)).toEqual([
    { selected: false },
    { selected: true },
  ]);
});

it('fires onChange with the tapped skill id', () => {
  const onChange = jest.fn();
  const root = renderPicker(null, onChange);
  const t = tiles(root);
  act(() => {
    t[1].props.onPress();
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('sk-elec');
});

// --- Redesign (2026-09-20): header, search, capped grid ----------------------

it('shows the catalog count chip and fires onBrowseAll from the Browse all link', () => {
  const onBrowseAll = jest.fn();
  const root = renderPicker(null, () => {}, onBrowseAll);

  expect(hasText(root, '3 available')).toBe(true);

  pressLabelled(root, 'Browse all skills');
  expect(onBrowseAll).toHaveBeenCalledTimes(1);
});

it('renders the optional section title inline before the count chip', () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <SkillPicker
        title="Skill"
        options={SKILLS}
        value={null}
        onChange={() => {}}
        onBrowseAll={() => {}}
      />,
    );
  });

  expect(hasText(renderer.root, 'Skill')).toBe(true);
  expect(hasText(renderer.root, '3 available')).toBe(true);
});

it('caps the idle grid at two tiles and routes the rest through the "+N More skills" tile', () => {
  const onBrowseAll = jest.fn();
  const root = renderPicker(null, () => {}, onBrowseAll, SEVEN);

  const labels = tileLabels(root);
  // Seed order holds: the two earliest rows only — Pest Control onward are
  // catalog rows 3-7 and must NOT leak onto the idle grid.
  expect(labels).toContain('Plumbing');
  expect(labels).toContain('Electrical');
  expect(labels).not.toContain('Pest Control');
  expect(labels).not.toContain('Leak Detection');
  expect(labels).not.toContain('Painting');
  expect(labels).toContain('+5');
  expect(labels).toContain('More skills');

  pressLabelled(root, 'More skills — 5 more available');
  expect(onBrowseAll).toHaveBeenCalledTimes(1);
});

it('shows no "+N more" tile while a search is active', () => {
  const root = renderPicker(null, () => {}, () => {}, SEVEN);
  typeIntoSearch(root, 'leak');
  expect(tileLabels(root)).not.toContain('More skills');
  expect(tileLabels(root)).toContain('Leak Detection');
});

it('searches the whole catalog, not just the idle tiles', () => {
  const root = renderPicker(null, () => {}, () => {}, SEVEN);
  typeIntoSearch(root, 'paint');
  const labels = tileLabels(root);
  expect(labels).toContain('Painting');
  expect(labels).not.toContain('Plumbing');
});

it('matches on descriptions too, and says so when nothing fits', () => {
  const root = renderPicker(null, () => {}, () => {}, SEVEN);

  typeIntoSearch(root, 'hidden');
  expect(tileLabels(root)).toContain('Leak Detection');

  typeIntoSearch(root, 'zzz-no-such-skill');
  expect(tileLabels(root)).not.toContain('Plumbing');
  expect(tileLabels(root).some(label => label.includes('No skills match'))).toBe(
    true,
  );
});

// --- Selection × grid cap × search -------------------------------------------

it('pins a selection made beyond the first two onto the idle grid', () => {
  // Chosen via "Browse all" or a search, the selection would otherwise be
  // invisible on the default surface — the section would show no answer to
  // "what skill is this job?".
  const root = renderPicker('sk-paint', () => {}, () => {}, SEVEN);
  const labels = tileLabels(root);

  expect(labels).toContain('Painting');
  expect(labels).not.toContain('Electrical'); // the displaced second tile
  expect(
    tiles(root).find(t => t.props.accessibilityState.selected),
  ).toBeDefined();
  // Still exactly two tiles — the pin replaces, never adds a third.
  expect(tiles(root)).toHaveLength(2);
});

it('re-fires onChange with the same id when the selected row is tapped', () => {
  // Tapping the current selection must stay a plain id change — the parent
  // (handleSkillChange) owns the no-op, not the picker.
  const onChange = jest.fn();
  const root = renderPicker('sk-elec', onChange);
  const selected = tiles(root).find(t => t.props.accessibilityState.selected);

  act(() => {
    selected?.props.onPress();
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('sk-elec');
});

it('keeps the selection visible when a search matches it', () => {
  const root = renderPicker('sk-leak', () => {}, () => {}, SEVEN);
  typeIntoSearch(root, 'leak');

  expect(tileLabels(root)).toContain('Leak Detection');
  expect(
    tiles(root).find(t => t.props.accessibilityState.selected),
  ).toBeDefined();
});
