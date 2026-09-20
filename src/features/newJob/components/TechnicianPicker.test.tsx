/**
 * Render/selection tests for the feature-local TechnicianPicker tile grid —
 * the New Job technician section mirroring the CustomerPicker pattern
 * (product feedback 2026-09-20, story 11-8):
 *
 * - header row: the inline `title`, a technician count chip ("N
 *   technicians", singularised) and a "Browse all" link that fires
 *   `onBrowseAll`;
 * - a 3-column grid whose idle state is the FIRST TWO technicians in the
 *   offered order (the caller skill-filters and keeps the profile's order —
 *   this picker reorders nothing) plus a "+N More technicians" tile — 2
 *   tiles + the more tile fill exactly one complete row (COLUMNS = 3);
 *   a search that, when non-empty, filters the whole offered roster
 *   (name or phone digits, via the real `filterTechnicians`) and shows a
 *   no-match message;
 * - a tap fires `onChange` with the technician's id; re-tapping the selected
 *   tile fires `onChange(null)` — toggle-to-clear, carried from the old
 *   sheet-variant picker (a draft may be unassigned, unlike customers);
 * - a technician still awaiting install shows the "Invited" caption.
 *
 * Selection × cap × search: a selection made outside the first two is
 * pinned onto the idle grid (still exactly two tiles), and a search that
 * matches the selection keeps it visible.
 *
 * Presentational only — the parent owns the option list. The real
 * `filterTechnicians` / `Avatar` run here (they have their own coverage);
 * tile internals beyond selection state and labels are not asserted.
 */
import type ReactTestRenderer from 'react-test-renderer';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { TechnicianPicker } from './TechnicianPicker';
import type { ProfileTechnician } from '../../../services';

const make = (overrides: Partial<ProfileTechnician>): ProfileTechnician => ({
  id: 't-1',
  name: 'Ravi Kumar',
  countryCode: '+91',
  phoneNumber: '9000000001',
  status: 'invited',
  skills: ['Plumbing'],
  skillIds: ['s-1'],
  createdAt: '2026-09-01T10:00:00Z',
  ...overrides,
});

const TECHNICIANS: ProfileTechnician[] = [
  make({ id: 't-1', name: 'Ravi Kumar', status: 'active' }),
  // The only row left on `invited` — and within the first two, so the
  // "Invited" caption tests can see it on the idle grid.
  make({ id: 't-2', name: 'Anita Sharma' }),
  make({ id: 't-3', name: 'Gopal Menon', status: 'active' }),
];

/** Seven rows so the two-tile cap and the "+N more" tile both engage. */
const SEVEN: ProfileTechnician[] = [
  ...TECHNICIANS,
  make({ id: 't-4', name: 'Divya Iyer', status: 'active' }),
  make({ id: 't-5', name: 'Bala Singh', status: 'active' }),
  make({ id: 't-6', name: 'Meera Nair', status: 'active' }),
  make({ id: 't-7', name: 'Zoya Khan', status: 'active' }),
];

function renderPicker(
  value: string | null,
  onChange: (id: string | null) => void,
  onBrowseAll: () => void = () => {},
  options: ProfileTechnician[] = TECHNICIANS,
  title?: string,
) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <TechnicianPicker
        options={options}
        value={value}
        onChange={onChange}
        onBrowseAll={onBrowseAll}
        title={title}
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

it('renders the offered technicians as tiles, with the name as the label', () => {
  const root = renderPicker(null, () => {});
  const labels = tileLabels(root);
  expect(labels).toContain('Ravi Kumar');
  expect(labels).toContain('Anita Sharma');
  // The idle grid caps at two tiles — the third offered technician sits
  // behind the "+N more" tile.
  expect(labels).not.toContain('Gopal Menon');
  expect(labels).toContain('+1');
  expect(labels).toContain('More technicians');
});

it('marks the selected technician via accessibilityState', () => {
  // No reordering here: the idle grid is the offered roster's order, as-is.
  const root = renderPicker('t-2', () => {});
  expect(tiles(root).map(t => t.props.accessibilityState)).toEqual([
    { selected: false },
    { selected: true },
  ]);
});

it('fires onChange with the tapped technician id', () => {
  const onChange = jest.fn();
  const root = renderPicker(null, onChange);
  const t = tiles(root);
  act(() => {
    t[0].props.onPress();
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith('t-1');
});

it('fires onChange(null) when the selected tile is tapped again (toggle-to-clear)', () => {
  // Carried from the old sheet-variant picker: the draft allows an
  // unassigned state, so the selected tile's tap must offer a way out —
  // unlike the customer tiles, where the tap simply re-sends the id.
  const onChange = jest.fn();
  const root = renderPicker('t-2', onChange);
  const selected = tiles(root).find(t => t.props.accessibilityState.selected);

  act(() => {
    selected?.props.onPress();
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(null);
});

it('shows the count chip, the inline title, and fires onBrowseAll from the Browse all link', () => {
  const onBrowseAll = jest.fn();
  const root = renderPicker(null, () => {}, onBrowseAll, TECHNICIANS, 'Technician');

  expect(hasText(root, '3 technicians')).toBe(true);
  expect(hasText(root, 'Technician')).toBe(true);

  pressLabelled(root, 'Browse all technicians');
  expect(onBrowseAll).toHaveBeenCalledTimes(1);
});

it('singularises the count chip for a single technician', () => {
  const root = renderPicker(null, () => {}, () => {}, [TECHNICIANS[0]]);

  expect(hasText(root, '1 technician')).toBe(true);
  expect(hasText(root, '1 technicians')).toBe(false);
});

it('caps the idle grid at two tiles in offered order and routes the rest through the "+N More technicians" tile', () => {
  const onBrowseAll = jest.fn();
  const root = renderPicker(null, () => {}, onBrowseAll, SEVEN);

  const labels = tileLabels(root);
  // Offered order, untouched: the first two ids in, the first two out —
  // rank 3 (Gopal) onward must NOT leak onto the idle grid.
  expect(labels).toContain('Ravi Kumar');
  expect(labels).toContain('Anita Sharma');
  expect(labels).not.toContain('Gopal Menon');
  expect(labels).not.toContain('Divya Iyer');
  expect(labels).not.toContain('Zoya Khan');
  expect(labels).toContain('+5');
  expect(labels).toContain('More technicians');

  pressLabelled(root, 'More technicians — 5 more available');
  expect(onBrowseAll).toHaveBeenCalledTimes(1);
});

it('shows no "+N more" tile while a search is active', () => {
  const root = renderPicker(null, () => {}, () => {}, SEVEN);
  typeIntoSearch(root, 'zoya');
  expect(tileLabels(root)).not.toContain('More technicians');
  expect(tileLabels(root)).toContain('Zoya Khan');
});

it('searches the whole offered roster, not just the idle tiles', () => {
  const root = renderPicker(null, () => {}, () => {}, SEVEN);
  typeIntoSearch(root, 'zoya');
  const labels = tileLabels(root);
  expect(labels).toContain('Zoya Khan');
  expect(labels).not.toContain('Ravi Kumar');
});

it('matches on phone digits too, and says so when nothing fits', () => {
  const root = renderPicker(null, () => {}, () => {}, SEVEN);

  typeIntoSearch(root, '9000');
  expect(tileLabels(root)).toContain('Ravi Kumar');

  typeIntoSearch(root, 'zzz-no-such-technician');
  expect(tileLabels(root)).not.toContain('Ravi Kumar');
  expect(
    tileLabels(root).some(label => label.includes('No technicians match')),
  ).toBe(true);
});

it('pins a selection made beyond the first two onto the idle grid', () => {
  // Chosen via "Browse all" or an invite, the selection would otherwise be
  // invisible on the default surface — the section would show no answer to
  // "who will do this job?".
  const root = renderPicker('t-7', () => {}, () => {}, SEVEN);
  const labels = tileLabels(root);

  expect(labels).toContain('Zoya Khan');
  expect(labels).not.toContain('Anita Sharma'); // the displaced second tile
  expect(
    tiles(root).find(t => t.props.accessibilityState.selected),
  ).toBeDefined();
  // Still exactly two tiles — the pin replaces, never adds a third.
  expect(tiles(root)).toHaveLength(2);
});

it('keeps the selection visible when a search matches it', () => {
  const root = renderPicker('t-7', () => {}, () => {}, SEVEN);
  typeIntoSearch(root, 'zoya');

  expect(tileLabels(root)).toContain('Zoya Khan');
  expect(
    tiles(root).find(t => t.props.accessibilityState.selected),
  ).toBeDefined();
});

it('shows the Invited caption for a technician still awaiting install', () => {
  // t-2 is the only row left on `invited`, and it sits inside the idle grid —
  // the caption marks a just-invited technician so they don't look identical
  // to an installed one.
  const root = renderPicker(null, () => {}, () => {}, TECHNICIANS);
  expect(hasText(root, 'Invited')).toBe(true);

  const installed = renderPicker(
    null,
    () => {},
    () => {},
    TECHNICIANS.filter(t => t.status !== 'invited'),
  );
  expect(hasText(installed, 'Invited')).toBe(false);
});
